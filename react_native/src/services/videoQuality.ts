/**
 * HyperBabel Video — resolution policy and billing-tier declaration.
 *
 * ── Why this file exists ────────────────────────────────────────────────
 * HyperBabel meters video by **resolution tier**, and the tier is decided by
 * the total resolution each participant RECEIVES — not by what one camera
 * sends. In a group call every participant receives (N - 1) remote streams,
 * so the tier climbs with the number of people even when each camera keeps
 * the same resolution.
 *
 * The HD tier tops out at 921,600 pixels (1280 x 720) per participant. The
 * two presets below are chosen so that every supported call size stays at or
 * under that ceiling:
 *
 *   remotes 0 (live-stream host)  ->  1280x720, each viewer receives   921,600  OK
 *   remotes 1 (1:1 call)          ->  1280x720, the peer receives      921,600  OK
 *   remotes 2 (3-way call)        ->   640x480, each receives 2x307,200 = 614,400  OK
 *   remotes 3 (4-way call)        ->   640x480, each receives 3x307,200 = 921,600  OK
 *
 * A 5th publisher would push the sum to 1,228,800 and move the whole call to
 * the next (more expensive) tier — that is why group calls are capped at 4.
 *
 *  TWO SUMS GET QUOTED FOR A GROUP CALL — KEEP THEM STRAIGHT
 *
 *    what ONE participant RECEIVES  =  (N-1) x preset   <- the tier is based on THIS
 *    what the WHOLE CALL PUBLISHES  =   N    x preset   <- larger, and not the basis
 *
 *  The presets above hold the RECEIVED sum at or under the ceiling for every
 *  supported call size, which is exactly the rule the HyperBabel Console applies
 *  in its own video surfaces. For a 4-way call that is 3 x 307,200 = 921,600
 *  received (at the ceiling) while the call as a whole publishes 1,228,800.
 *
 *  If your own policy is the stricter "nothing the call publishes may add up to
 *  more than HD", use this ladder instead — it costs 1:1 calls their 720p:
 *
 *    1 publisher  -> 1280x720   total   921,600
 *    2 publishers ->  848x480   total   814,080
 *    3 publishers ->  640x480   total   921,600
 *    4 publishers ->  640x360   total   921,600
 *
 *  LEAVING AND REJOINING
 *
 *  The roster is re-evaluated on every join and every leave, so a call that
 *  drops from four participants to two moves back up to 1280x720, and the
 *  participant who rejoins pulls everyone back down to 640x480 before their
 *  first frame is published. Nothing is pinned to the size the call started at.
 *
 * ⚠️ Setting this explicitly matters on mobile: the SDK's own default is
 *    960x540, so a 3-way call left at the default already sends every
 *    participant 1,036,800 pixels — above the HD ceiling.
 *
 * ── What you must change if you raise the resolution ────────────────────
 * `declaredQuality()` is sent to HyperBabel when the session is created and is
 * what your invoice is calculated from. If you publish above these presets,
 * you MUST declare the matching tier — declaring accurately is a contractual
 * obligation (Terms section 5.1) and under-declaring is corrected later with
 * an adjustment charge (section 5.2).
 *
 * Keep the encoder preset and the declared tier in THIS file so they can
 * never drift apart.
 */

/** Billing tiers HyperBabel accepts when a session is created. */
export type VideoQualityTier = 'hd' | 'fhd' | '2k' | '2k_plus';

/** HD tier ceiling, in pixels, per receiving participant. */
export const HD_BUDGET_PX = 921_600;

export interface VideoPreset {
  width: number;
  height: number;
  frameRate: number;
  /** Kbps. */
  bitrate: number;
  /** Kbps. */
  minBitrate: number;
}

/** Used when the participant receives at most one remote stream. */
export const PRESET_SOLO_OR_1TO1: VideoPreset = {
  width: 1280,
  height: 720,
  frameRate: 30,
  bitrate: 2000,
  minBitrate: 200,
};

/** Used from 3 participants up — keeps 3 remotes inside the HD budget. */
export const PRESET_GROUP: VideoPreset = {
  width: 640,
  height: 480,
  frameRate: 24,
  bitrate: 1000,
  minBitrate: 150,
};

/**
 * Pick the publishing preset for the current call size.
 *
 * @param remoteCount remote participants currently in the channel. Count
 *   everyone in the channel, not only those with a camera on: a muted camera
 *   can be turned back on at any moment. Over-counting lowers the resolution
 *   (safe); under-counting is what pushes the call into a higher tier than
 *   you declared.
 */
export function encoderForRemoteCount(remoteCount: number): VideoPreset {
  const n = Number.isFinite(remoteCount) && remoteCount > 0 ? remoteCount : 0;
  return n <= 1 ? PRESET_SOLO_OR_1TO1 : PRESET_GROUP;
}

/** The same preset shaped for the RTC SDK's encoder configuration call. */
export function encoderConfigForRemoteCount(remoteCount: number) {
  const p = encoderForRemoteCount(remoteCount);
  return {
    dimensions: { width: p.width, height: p.height },
    frameRate: p.frameRate,
    bitrate: p.bitrate,
    minBitrate: p.minBitrate,
  };
}

/**
 * The billing tier to declare when creating a video or live-stream session.
 *
 * Both presets above stay inside the HD budget, so this is always `'hd'`.
 * If you replace the presets with something larger, return the matching tier
 * here as well.
 */
export function declaredQuality(): VideoQualityTier {
  const largest = PRESET_SOLO_OR_1TO1.width * PRESET_SOLO_OR_1TO1.height;
  return largest <= HD_BUDGET_PX ? 'hd' : 'fhd';
}

/**
 * The `publish_resolution` to declare when creating a session with
 * `participantCount` people in it.
 *
 * HyperBabel treats this as OPTIONAL evidence, never as the billing basis —
 * billing always follows `quality`. Sending it lets the server multiply this
 * resolution by the number of streams each participant receives and tell you,
 * in the creation response (`quality_warning`), when the total lands in a
 * higher tier than the one you declared. That is the mistake worth catching:
 * an honest 720p declaration is correct 1:1 and wrong at four people.
 *
 * ⚠️ Send the resolution for THIS session at THIS size — not the camera
 * maximum. The presets above shrink as the call grows.
 *
 * @param participantCount total people in the session, including the local
 *   user. A broadcast host publishes alone → pass 1.
 */
export function publishResolutionFor(participantCount: number): { width: number; height: number } {
  const total = Number.isFinite(participantCount) && participantCount > 0 ? participantCount : 1;
  const preset = encoderForRemoteCount(total - 1);
  return { width: preset.width, height: preset.height };
}
