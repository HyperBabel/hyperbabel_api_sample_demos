/**
 * HyperBabel Speech Translation (live captions) client.
 *
 * Streams the local microphone to the HyperBabel realtime speech-translation
 * WebSocket and yields live captions — the original transcript plus, when a
 * target language is set, its translation — while a video call is running.
 *
 * Full protocol reference: https://hyperbabel.com/docs#stt-api
 *
 * Flow (mirrors the docs):
 *   1. Speech translation attaches to an ACTIVE video call — pass the call's
 *      session_id (from the session you created/joined) or the room_id of a
 *      room-scoped call. The relay verifies you are a participant.
 *   2. Open  wss://api.hyperbabel.com/api/v1/stt-relay
 *              ?token=<customer JWT>&lang=<spoken>&translate=<target>
 *              &session_id=<id>&room_id=<room>
 *   3. Wait for {"kind":"ready"}, then stream raw PCM (16 kHz · mono ·
 *      16-bit little-endian) in ~100 ms binary frames.
 *   4. Render caption messages:
 *        partial / final        — original-language track
 *        partial_tr / final_tr  — translation track (only when `translate` set)
 *   5. Send the text frame "EOS" to finish — usage is metered on close.
 *
 * Billing note: the platform meters the audio you actually SEND (per minute,
 * against your org's speech-translation allowance). Captions here run only
 * while the user keeps them enabled, so gating this behind a CC button — as
 * VideoCallPage does — is also the cost control.
 *
 * Auth note: the customer JWT is read from localStorage at start. Access
 * tokens live ~1 h; if a very long call outlives the token and the socket
 * drops, simply call startLiveCaptions() again — the api client keeps the
 * stored pair fresh as other requests happen.
 */

import api, { STORAGE_KEY_ACCESS_TOKEN } from './api';

const BASE_URL = import.meta.env.VITE_HB_API_URL || 'https://api.hyperbabel.com/api/v1';
const TARGET_SAMPLE_RATE = 16000;
const FLUSH_INTERVAL_MS = 100; // batch mic samples into ~100 ms frames

/**
 * Inline AudioWorklet: forwards raw Float32 microphone quanta to the main
 * thread, where they are batched + downsampled before hitting the socket.
 */
const WORKLET_SRC = `
class PcmTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch && ch.length) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('pcm-tap', PcmTap);
`;

/** Downsample Float32 samples at inRate to 16 kHz 16-bit signed LE PCM. */
function downsampleToS16(input, inRate) {
  if (inRate === TARGET_SAMPLE_RATE) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inRate / TARGET_SAMPLE_RATE;
  const outLen = Math.floor(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    const s = Math.max(-1, Math.min(1, input[i0] * (1 - frac) + input[i1] * frac));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Fetch the spoken-language list for pickers (small, slow-changing — safe to
 * cache for the session). Each entry: { stt_lang_cd, language_name,
 * native_name, country_name }. Use the base part of a code (e.g. "en") as the
 * translation target.
 */
let languagesCache = null;
export async function getSpokenLanguages() {
  if (languagesCache) return languagesCache;
  const data = await api.get('/stt/languages');
  languagesCache = data?.languages || [];
  return languagesCache;
}

/**
 * Start streaming live captions for the local microphone.
 *
 * @param {object}   opts
 * @param {string}   opts.lang        Spoken language code (from getSpokenLanguages).
 * @param {string}   [opts.translateTo] Target language base code; omit for
 *                                      transcription-only (no *_tr messages).
 * @param {string}   [opts.sessionId] Active video call session id.
 * @param {string}   [opts.roomId]    Room id (room-scoped calls) — pass at
 *                                    least one of sessionId / roomId.
 * @param {function} opts.onCaption   ({ kind, text, lang }) per caption message.
 * @param {function} [opts.onStatus]  ('connecting'|'ready'|'closed') lifecycle.
 * @param {function} [opts.onError]   (message) on relay/socket errors.
 * @returns {{ stop: () => void }}    Handle — call stop() to end the session
 *                                    (flushes the last utterance and meters usage).
 */
export function startLiveCaptions({ lang, translateTo, sessionId, roomId, onCaption, onStatus, onError }) {
  let ws = null;
  let ctx = null;
  let stream = null;
  let ready = false;
  let stopped = false;

  const emitStatus = (s) => { try { onStatus?.(s); } catch { /* listener error — ignore */ } };

  const teardownAudio = () => {
    try { ctx?.close(); } catch { /* already closed */ }
    ctx = null;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    teardownAudio();
    if (ws && ws.readyState === WebSocket.OPEN) {
      // "EOS" flushes the buffered utterance server-side, meters the session,
      // and closes the socket. The delayed close() below is only a fallback.
      try { ws.send('EOS'); } catch { /* closing */ }
      setTimeout(() => { try { ws.close(); } catch { /* ignore */ } }, 1200);
    } else {
      try { ws?.close(); } catch { /* ignore */ }
    }
    emitStatus('closed');
  };

  (async () => {
    emitStatus('connecting');
    try {
      // Refresh-aware token read: ping a cheap authenticated endpoint first so
      // the api client's proactive-refresh machinery renews an expiring pair
      // (a call page can sit >1 h with no other API traffic), then read the
      // stored access token for the WS handshake.
      await api.get('/customer/me').catch(() => { /* offline — fall through with stored token */ });
      const token = localStorage.getItem(STORAGE_KEY_ACCESS_TOKEN);
      if (!token) {
        throw new Error('Not signed in — a customer JWT is required for live captions.');
      }
      if (stopped) return;

      // 1) Microphone — a dedicated track, independent of the RTC-published
      //    one (browsers allow multiple captures of the same device).
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (stopped) { teardownAudio(); return; }

      // 2) Relay socket.
      const qs = new URLSearchParams({ token, lang });
      if (translateTo) qs.set('translate', translateTo.split('-')[0]);
      if (sessionId) qs.set('session_id', sessionId);
      if (roomId) qs.set('room_id', roomId);
      ws = new WebSocket(`${BASE_URL.replace(/^http/i, 'ws')}/stt-relay?${qs.toString()}`);
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (ev) => {
        // A stopped session must not surface anything — the EOS grace window
        // (~1.2 s) still flushes finals from the OLD stream, and delivering
        // them would contaminate a just-restarted session's UI.
        if (stopped || typeof ev.data !== 'string') return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        switch (msg.kind) {
          case 'ready':
            ready = true;
            emitStatus('ready');
            break;
          case 'partial':
          case 'final':
          case 'partial_tr':
          case 'final_tr':
            try { onCaption?.(msg); } catch { /* listener error — ignore */ }
            break;
          case 'error':
            try { onError?.(String(msg.message ?? msg.code ?? 'captions error')); } catch { /* ignore */ }
            stop();
            break;
          default:
            break; // keepalive + forward-compatible unknown kinds
        }
      };
      ws.onclose = () => { if (!stopped) stop(); };
      ws.onerror = () => {
        try { onError?.('Could not reach the speech-translation service.'); } catch { /* ignore */ }
        if (!stopped) stop();
      };

      // 3) Audio pipeline: worklet taps Float32 quanta → main thread batches,
      //    downsamples to 16 kHz mono s16le, and streams binary frames. Audio
      //    is only forwarded after the relay reports `ready`.
      ctx = new AudioContext();
      // Browsers may start an AudioContext suspended outside a user gesture
      // (notably iOS Safari) — resume defensively; callers should invoke
      // startLiveCaptions() from a click handler like the CC button.
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* best-effort */ } }
      if (stopped) return; // stop() raced the resume — ctx is already closed
      const source = ctx.createMediaStreamSource(stream);
      const pending = [];
      let pendingLen = 0;
      const flushThreshold = Math.floor((ctx.sampleRate * FLUSH_INTERVAL_MS) / 1000);

      const pushChunk = (chunk) => {
        if (stopped || !ready || !ws || ws.readyState !== WebSocket.OPEN) return;
        pending.push(chunk);
        pendingLen += chunk.length;
        if (pendingLen < flushThreshold) return;
        const merged = new Float32Array(pendingLen);
        let off = 0;
        for (const c of pending) { merged.set(c, off); off += c.length; }
        pending.length = 0;
        pendingLen = 0;
        const pcm = downsampleToS16(merged, ctx.sampleRate);
        try { ws.send(pcm.buffer); } catch { /* socket closing */ }
      };

      if (ctx.audioWorklet) {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        if (stopped) return; // stop() raced module load — don't build nodes on a closed ctx
        const tap = new AudioWorkletNode(ctx, 'pcm-tap');
        tap.port.onmessage = (ev) => pushChunk(ev.data);
        source.connect(tap);
        // Keep the graph rooted through a muted gain (some engines suspend
        // unrooted graphs); the mic is never audible locally.
        const mute = ctx.createGain();
        mute.gain.value = 0;
        tap.connect(mute).connect(ctx.destination);
      } else {
        // Legacy fallback for browsers without AudioWorklet.
        const sp = ctx.createScriptProcessor(4096, 1, 1);
        sp.onaudioprocess = (ev) => pushChunk(new Float32Array(ev.inputBuffer.getChannelData(0)));
        source.connect(sp);
        sp.connect(ctx.destination);
      }
    } catch (err) {
      if (stopped) return; // stale failure of an already-stopped session — silent
      try { onError?.(err?.message || 'Failed to start live captions.'); } catch { /* ignore */ }
      stop();
    }
  })();

  return { stop };
}
