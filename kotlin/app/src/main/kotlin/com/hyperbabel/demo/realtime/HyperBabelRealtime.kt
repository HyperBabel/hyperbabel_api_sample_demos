/*
 * HyperBabel Real-Time client.
 *
 *   1. Hit POST /rtm/token to fetch a server-signed token request and the
 *      org id we'll namespace channels with.
 *   2. Hand the payload to the underlying real-time SDK's authCallback so
 *      tokens auto-renew in the background.
 *   3. Subscribe on `hb:{compactOrgId}:room:{roomId}` for room events. Both
 *      chat messages and typing pings come through this single channel —
 *      callers should look at the payload's `type` field to disambiguate.
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
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.util.concurrent.atomic.AtomicBoolean

object HyperBabelRealtime {

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    @Volatile private var client: RealtimeClient? = null
    @Volatile private var orgId: String? = null
    @Volatile private var connecting = false

    val isConnected: Boolean get() = client != null

    /**
     * Open a long-lived connection. The first token round-trip also tells
     * us which `orgId` to namespace channels with, which we keep on hand
     * for [subscribeRoom]. Idempotent — a second call while already
     * connected (or while a connect is in flight) is a no-op.
     */
    fun connect(onError: (Throwable) -> Unit = {}) {
        if (client != null || connecting) return
        connecting = true
        scope.launch {
            try {
                val initial = ApiClient.rtm.realtimeToken(
                    RealtimeTokenRequest(
                        userId = Session.userId,
                        userName = Session.displayName,
                        preferredLangCd = Session.preferredLangCd,
                    )
                )
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
            } catch (t: Throwable) {
                onError(t)
            } finally {
                connecting = false
            }
        }
    }

    /**
     * Subscribe to room-scoped events. Returns an unsubscribe lambda. The
     * channel name format (`hb:{compactOrgId}:room:{roomId}`) is fixed by
     * the server and must be reproduced exactly. Callers receive the
     * event name (e.g. `message`, `message.deleted`, `read_receipt`) and
     * a Map view of the payload.
     */
    fun subscribeRoom(roomId: String, onEvent: (String, Any?) -> Unit): () -> Unit {
        val active = client ?: return { /* not connected */ }
        val ch: RealtimeChannel = active.channels.get(channelNameFor(roomId))
        val listener = RealtimeChannel.MessageListener { msg ->
            onEvent(msg.name.orEmpty(), msg.data?.toLooseValue())
        }
        ch.subscribe(listener)
        // Best-effort attach so the first published message isn't dropped.
        runCatching { ch.attach() }
        return {
            runCatching { ch.unsubscribe(listener) }
        }
    }

    fun disconnect() {
        runCatching { client?.close() }
        client = null
        orgId = null
    }

    // ── Internals ────────────────────────────────────────────────────────────

    private fun channelNameFor(roomId: String): String {
        // The server compacts the orgId (strips dashes) before namespacing.
        val compact = (orgId ?: "unknown").replace("-", "")
        return "hb:$compact:room:$roomId"
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
