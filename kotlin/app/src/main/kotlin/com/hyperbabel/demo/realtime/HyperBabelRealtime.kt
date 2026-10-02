/*
 * HyperBabel Real-Time client.
 *
 *   1. Hit POST /rtm/token to fetch a server-signed token request and the
 *      org id we'll namespace channels with.
 *   2. Hand the payload to the underlying real-time SDK's authCallback so
 *      tokens auto-renew in the background.
 *   3. Subscribe with the room's `realtime_channel` from the REST API. Both
 *      chat messages and typing pings come through this single channel —
 *      callers should look at the payload's `type` field to disambiguate.
 *   4. Subscribe to the signed-in user's PRIVATE channel,
 *      `user:{orgId}:{userId}`, for peer signals such as incoming calls
 *      (event name `signal`, `data.type == "CALL_INVITE"`).
 *
 * connect() is asynchronous — it needs the token round-trip first. Subscribe
 * only once [HyperBabelRealtime.ready] is true; before that there is no client
 * and a subscription would silently do nothing.
 *
 * Vendor SDK class names are imported under neutral aliases so the body of
 * this file talks about HyperBabel concepts only.
 */
package com.hyperbabel.demo.realtime

import com.google.gson.JsonArray
import com.google.gson.JsonElement
import com.google.gson.JsonObject
import com.hyperbabel.demo.api.ApiClient
import com.hyperbabel.demo.data.RealtimeTokenPayload
import com.hyperbabel.demo.data.RealtimeTokenRequest
import com.hyperbabel.demo.data.Session
import io.ably.lib.realtime.AblyRealtime as RealtimeClient
import io.ably.lib.realtime.Channel as RealtimeChannel
import io.ably.lib.rest.Auth
import io.ably.lib.types.ClientOptions
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.concurrent.atomic.AtomicBoolean

object HyperBabelRealtime {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var client: RealtimeClient? = null
    @Volatile private var orgId: String? = null
    @Volatile private var connecting = false
    /**
     * Bumped by [disconnect]. A connect() still waiting for its token when the
     * user signs out must not install a client for the previous user.
     */
    @Volatile private var generation = 0

    private val _ready = MutableStateFlow(false)

    /** True once the client exists and channels can be subscribed. */
    val ready: StateFlow<Boolean> = _ready.asStateFlow()

    val isConnected: Boolean get() = client != null

    /**
     * Open a long-lived connection. The first token round-trip also tells
     * us which `orgId` to namespace channels with, which we keep on hand
     * for [subscribeUserChannel]. Idempotent — a second call while already
     * connected (or while a connect is in flight) is a no-op.
     */
    fun connect(onError: (Throwable) -> Unit = {}) {
        if (client != null || connecting) return
        connecting = true
        val gen = generation
        scope.launch {
            try {
                val initial = ApiClient.rtm.realtimeToken(
                    RealtimeTokenRequest(
                        userId = Session.userId,
                        userName = Session.displayName,
                        preferredLangCd = Session.preferredLangCd,
                    )
                )
                if (gen != generation) return@launch // signed out meanwhile
                val payload = initial.tokenRequest
                    ?: throw IllegalStateException("Server did not return a real-time token request payload")
                val oid = initial.orgId.orEmpty()
                orgId = oid

                val firstUsed = AtomicBoolean(false)
                val opts = ClientOptions().apply {
                    clientId = if (oid.isNotEmpty()) "$oid:${Session.userId}" else Session.userId
                    echoMessages = false
                    autoConnect = true
                    authCallback = Auth.TokenCallback { _ ->
                        if (firstUsed.compareAndSet(false, true)) {
                            payload.toSdkTokenRequest()
                        } else {
                            // Token expired — fetch a fresh signed token request.
                            // The real-time SDK invokes this on a non-suspending
                            // worker thread, so blocking here is the canonical
                            // pattern.
                            runBlocking {
                                val refreshed = ApiClient.rtm.realtimeToken(
                                    RealtimeTokenRequest(
                                        userId = Session.userId,
                                        userName = Session.displayName,
                                        preferredLangCd = Session.preferredLangCd,
                                    )
                                )
                                refreshed.tokenRequest?.toSdkTokenRequest()
                                    ?: error("Token refresh missing payload")
                            }
                        }
                    }
                }
                client = RealtimeClient(opts)
                _ready.value = true
            } catch (t: Throwable) {
                if (gen == generation) onError(t)
            } finally {
                if (gen == generation) connecting = false
            }
        }
    }

    /**
     * Subscribe to a room's real-time events. Returns an unsubscribe lambda.
     *
     * [realtimeChannel] MUST be the room's `realtime_channel` value from the
     * REST API, passed through verbatim. Do not rebuild it from a room id —
     * the server derives the name from values this client does not have, so a
     * reconstructed name subscribes to a channel nobody publishes on and the
     * failure is silent.
     *
     * Typing indicators arrive on this same channel as a `{ type: "typing" }`
     * payload; there is no separate typing channel.
     *
     * Callers receive the event name (e.g. `message`, `message.deleted`,
     * `message.updated`, `read_receipt`) and a Map view of the payload. For
     * `message.deleted` / `message.updated` the message id is inside the
     * payload's `data` object (`data.message_id`), not at the top level.
     */
    fun subscribeRoom(realtimeChannel: String, onEvent: (String, Any?) -> Unit): () -> Unit =
        subscribe(realtimeChannel, onEvent)

    /**
     * Subscribe to the signed-in user's PRIVATE channel,
     * `user:{orgId}:{userId}`. Returns an unsubscribe lambda.
     *
     * The server publishes peer-scoped signals here under the event name
     * `signal`; the payload's `type` tells them apart — `CALL_INVITE` (someone
     * is calling you: `roomId`, `sessionId`, `callerId`, `callerName`,
     * `callType`, …) or `CALL_BUSY` (a user you called is on another call).
     * The token from POST /rtm/token grants subscribe access to exactly this
     * channel for the signed-in user. Call only once [ready] is true — the
     * org id comes from the token response.
     */
    fun subscribeUserChannel(onEvent: (String, Any?) -> Unit): () -> Unit {
        val oid = orgId
        val userId = Session.userId
        if (oid.isNullOrEmpty() || userId.isBlank()) return { /* not connected */ }
        return subscribe("user:$oid:$userId", onEvent)
    }

    /**
     * If a room-channel event is a call event of [sessionId], returns its name;
     * otherwise null. Call events are stored `video_call` system messages
     * published as event `message`, with `data.metadata = { event, session_id, … }`
     * and `event` one of `call_started`, `call_accepted`, `call_ended`,
     * `call_rejected`, `call_missed`, `call_busy`.
     */
    fun callEventOf(name: String, payload: Any?, sessionId: String): String? {
        if (name != "message") return null
        val data = (payload as? Map<*, *>)?.get("data") as? Map<*, *> ?: return null
        if (data["message_type"]?.toString() != "video_call") return null
        val meta = data["metadata"] as? Map<*, *> ?: return null
        if (meta["session_id"]?.toString() != sessionId) return null
        return meta["event"]?.toString()
    }

    fun disconnect() {
        generation++
        connecting = false
        runCatching { client?.close() }
        client = null
        orgId = null
        _ready.value = false
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private fun subscribe(channelName: String, onEvent: (String, Any?) -> Unit): () -> Unit {
        val active = client ?: return { /* not connected */ }
        if (channelName.isEmpty()) return { /* nothing to subscribe */ }
        val ch: RealtimeChannel = active.channels.get(channelName)
        val listener = RealtimeChannel.MessageListener { msg ->
            onEvent(msg.name.orEmpty(), msg.data?.toLooseValue())
        }
        ch.subscribe(listener)
        // Best-effort attach so the first published message isn't dropped.
        runCatching { ch.attach() }
        // Several screens can listen on the same channel (a chat screen and the
        // incoming-call overlay, say). Remove only THIS listener — never detach
        // or release the channel, or the other listeners go silent.
        return {
            runCatching { ch.unsubscribe(listener) }
        }
    }

    private fun RealtimeTokenPayload.toSdkTokenRequest(): Auth.TokenRequest {
        val req = Auth.TokenRequest()
        req.keyName = keyName.orEmpty()
        req.nonce = nonce.orEmpty()
        req.mac = mac.orEmpty()
        req.timestamp = timestamp ?: 0L
        req.ttl = ttl ?: 0L
        req.clientId = clientId
        req.capability = capability
        return req
    }

    /** Convert SDK payload (typically gson [JsonElement] or String) to a Map view. */
    private fun Any.toLooseValue(): Any? = when (this) {
        is JsonObject -> entrySet().associate { (k, v) -> k to v.toLooseValue() }
        is JsonArray -> map { it.toLooseValue() }
        is JsonElement -> when {
            isJsonNull -> null
            isJsonPrimitive -> asJsonPrimitive.let { p ->
                when {
                    p.isBoolean -> p.asBoolean
                    p.isNumber -> p.asNumber
                    else -> p.asString
                }
            }
            isJsonObject -> asJsonObject.toLooseValue()
            isJsonArray -> asJsonArray.toLooseValue()
            else -> toString()
        }
        is String -> runCatching {
            val parsed = com.google.gson.JsonParser.parseString(this)
            if (parsed.isJsonObject || parsed.isJsonArray) parsed.toLooseValue() else this
        }.getOrDefault(this)
        is Map<*, *> -> this
        else -> this
    }
}
