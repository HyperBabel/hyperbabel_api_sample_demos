/**
 * HyperBabel Speech Translation (live captions) — vanilla JS client.
 *
 * Streams the local microphone to the HyperBabel realtime speech-translation
 * WebSocket and yields live captions: the original transcript plus, when a
 * target language is set, its translation. Attaches to an ACTIVE video call
 * session (the relay verifies the caller is a participant).
 *
 * Protocol guide: https://hyperbabel.com/docs#stt-api
 *   client → relay : binary PCM 16 kHz · mono · 16-bit LE (~100 ms frames,
 *                    only after {"kind":"ready"}), text "EOS" to finish
 *   relay → client : partial / final (original) + partial_tr / final_tr
 *                    (translation), keepalive (ignore), error
 *
 * Billing: metered per minute of audio actually sent, against the org's
 * speech-translation plan allowance — keep it behind a user toggle.
 */

import { api, baseUrl, STORAGE_KEY_ACCESS_TOKEN } from '../api/client.js';

const TARGET_SAMPLE_RATE = 16000;

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
 * Start live captions for the local microphone.
 *
 * @param {object}   opts
 * @param {string}   opts.lang         Spoken language (stt_lang_cd, e.g. 'ko').
 * @param {string}   [opts.translateTo] Target language base code (e.g. 'en');
 *                                      omit for transcription-only.
 * @param {string}   [opts.sessionId]  Active video call session id.
 * @param {string}   [opts.roomId]     Room id — pass at least one of the two.
 * @param {function} opts.onCaption    ({ kind, text, lang }).
 * @param {function} [opts.onStatus]   ('connecting'|'ready'|'closed').
 * @param {function} [opts.onError]    (message).
 * @returns {{ stop: () => void }}
 */
export function startLiveCaptions({ lang, translateTo, sessionId, roomId, onCaption, onStatus, onError }) {
  let ws = null;
  let ctx = null;
  let stream = null;
  let ready = false;
  let stopped = false;

  const emitStatus = (s) => { try { onStatus?.(s); } catch { /* ignore */ } };

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
      // "EOS" flushes the last utterance server-side and meters the session.
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

      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (stopped) { teardownAudio(); return; }

      const qs = new URLSearchParams({ token, lang });
      if (translateTo) qs.set('translate', translateTo.split('-')[0]);
      if (sessionId) qs.set('session_id', sessionId);
      if (roomId) qs.set('room_id', roomId);
      ws = new WebSocket(`${baseUrl.replace(/^http/i, 'ws')}/stt-relay?${qs.toString()}`);
      ws.binaryType = 'arraybuffer';

      ws.onmessage = (ev) => {
        // A stopped session must not surface anything — the EOS grace window
        // (~1.2 s) still flushes finals from the OLD stream, and delivering
        // them would contaminate a just-restarted session's UI.
        if (stopped || typeof ev.data !== 'string') return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.kind === 'ready') { ready = true; emitStatus('ready'); return; }
        if (msg.kind === 'error') {
          try { onError?.(String(msg.message ?? msg.code ?? 'captions error')); } catch { /* ignore */ }
          stop();
          return;
        }
        if (['partial', 'final', 'partial_tr', 'final_tr'].includes(msg.kind)) {
          try { onCaption?.(msg); } catch { /* ignore */ }
        }
        // keepalive + unknown kinds: ignore (forward compatible)
      };
      ws.onclose = () => { if (!stopped) stop(); };
      ws.onerror = () => {
        try { onError?.('Could not reach the speech-translation service.'); } catch { /* ignore */ }
        if (!stopped) stop();
      };

      // Mic → worklet taps Float32 → batch ~100 ms → downsample → binary send.
      ctx = new AudioContext();
      if (ctx.state === 'suspended') { try { await ctx.resume(); } catch { /* best-effort */ } }
      if (stopped) return; // stop() raced the resume — ctx is already closed
      const source = ctx.createMediaStreamSource(stream);
      const pending = [];
      let pendingLen = 0;
      const flushThreshold = Math.floor(ctx.sampleRate / 10);

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
        try { ws.send(downsampleToS16(merged, ctx.sampleRate).buffer); } catch { /* closing */ }
      };

      if (ctx.audioWorklet) {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        if (stopped) return; // stop() raced module load — don't build nodes on a closed ctx
        const tap = new AudioWorkletNode(ctx, 'pcm-tap');
        tap.port.onmessage = (ev) => pushChunk(ev.data);
        source.connect(tap);
        const mute = ctx.createGain();
        mute.gain.value = 0;
        tap.connect(mute).connect(ctx.destination);
      } else {
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
