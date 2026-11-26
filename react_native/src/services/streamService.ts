/**
 * HyperBabel API — Live Stream Service
 *
 * Manages live broadcast sessions. The host publishes video/audio;
 * viewers join with subscriber-only RTC tokens.
 *
 * ⚠️ EVERY CALL IN THIS FILE NEEDS YOUR BACKEND — IT CANNOT RUN FROM THE APP.
 *
 *   `/stream/*` authenticates with your ORGANIZATION API KEY
 *   (`Authorization: Bearer hb_live_…`). Anything else is rejected up front:
 *
 *       POST /api/v1/stream/sessions
 *       → 401 { "error": { "code": "invalid_api_key_format" } }
 *
 *   Creating a broadcast allocates paid capacity and is metered against your
 *   organization, so the caller has to be YOU, not a signed-in end user. This
 *   demo only ever holds a customer JWT (`api.ts` refuses to carry an org key
 *   on a device), so these calls fail here by design.
 *
 *   Ship it as:  app  →  your backend (holds hb_live_…)  →  HyperBabel /stream/*
 *
 *   The paths, payloads, response shapes and call order below are accurate —
 *   implement them on your server and expose a thin endpoint the app can
 *   call. Two things to carry over:
 *     • The HOST publishes with `session.host.rtc_token` / `session.host.uid`
 *       from the create response. The viewer-token endpoint mints
 *       SUBSCRIBER tokens — never publish with one.
 *     • A stream session has no chat room. For live chat, create an `open`
 *       United Chat room for the broadcast and hand its id to host and
 *       viewers yourself (see components/stream/StreamChat).
 *
 * Base path: /stream
 */

import api from './api';
import type { VideoQualityTier } from './videoQuality';

const BASE = '/stream';

// ── Types ─────────────────────────────────────────────────────────────────

export interface CreateSessionParams {
  host_user_id:             string;
  title:                    string;
  host_display_name?:       string;
  host_profile_image_url?:  string;
  host_preferred_lang_cd?:  string;
  settings?:                Record<string, unknown>;
  /**
   * Billing tier for the broadcast: 'hd' (default) | 'fhd' | '2k' | '2k_plus'.
   * Declare the tier that matches what you actually publish — see
   * services/videoQuality.ts.
   */
  quality?:                 VideoQualityTier;
  /**
   * OPTIONAL self-check: the resolution the host will actually publish. The
   * server compares it with `quality` and returns `quality_warning` when the
   * aggregate implies a higher tier. Never the billing basis — `quality` is.
   * Build it with `publishResolutionFor()` in services/videoQuality.ts.
   */
  publish_resolution?:      { width: number; height: number };
}

export type StreamStatus = 'created' | 'live' | 'ended';

/**
 * POST /stream/sessions → `{ session: CreatedStreamSession }`.
 * The id is `session.id` (there is no `session_id`), and the HOST's
 * publishing credentials are `session.host.rtc_token` + `session.host.uid`.
 * The session creates no chat room.
 */
export interface CreatedStreamSession {
  id:           string;
  channel_name: string;
  /** Real-time channel the server announces start / end on. */
  rtm_channel:  string;
  title:        string;
  status:       StreamStatus;
  host: {
    user_id:           string;
    display_name:      string;
    profile_image_url: string | null;
    preferred_lang_cd: string | null;
    uid:               number;
    /** Publisher token — the host joins the video channel with this. */
    rtc_token:         string;
  };
  app_id:           string;
  quality:          VideoQualityTier;
  quality_warning?: string;
}

/** One row of GET /stream/sessions → `{ sessions: StreamListItem[], total }`. */
export interface StreamListItem {
  id:           string;
  title:        string;
  status:       StreamStatus;
  host:         { user_id: string; display_name: string };
  viewer_count: number;
  started_at:   string | null;
  created_at:   string;
}

/**
 * POST /stream/sessions/:id/viewer-token → this FLAT object (not wrapped in
 * `session`). `token` is a SUBSCRIBER token: it can watch, never publish.
 */
export interface ViewerToken {
  channel_name:      string;
  uid:               number;
  token:             string;
  display_name:      string;
  profile_image_url: string | null;
  preferred_lang_cd: string | null;
  host_user_id:      string;
  host_display_name: string;
  title:             string;
  app_id:            string;
}

export interface ViewerTokenParams {
  user_id?:                  string;
  viewer_display_name?:      string;
  viewer_profile_image_url?: string;
  viewer_preferred_lang_cd?: string;
}

// ── Host hand-off ─────────────────────────────────────────────────────────
//
// Only the create response carries the host's publisher token, so the
// screen that creates the broadcast keeps it here for the host screen to
// pick up. (A viewer token must never be used to publish.)

const createdSessions = new Map<string, CreatedStreamSession>();

/** The create response for a broadcast this app started, if still in memory. */
export const getCreatedSession = (sessionId: string): CreatedStreamSession | undefined =>
  createdSessions.get(sessionId);

// ── API calls ─────────────────────────────────────────────────────────────

/**
 * Create a new live stream session. The response carries the host's
 * publisher token (`session.host.rtc_token` / `session.host.uid`).
 */
export const createSession = async (data: CreateSessionParams) => {
  const res = await api.post<{ session: CreatedStreamSession }>(`${BASE}/sessions`, data);
  createdSessions.set(res.session.id, res.session);
  return res;
};

/**
 * Generate an RTC subscriber token for a viewer. Flat response — see
 * `ViewerToken`.
 */
export const getViewerToken = (sessionId: string, data: ViewerTokenParams = {}) =>
  api.post<ViewerToken>(`${BASE}/sessions/${sessionId}/viewer-token`, data);

/**
 * Start the broadcast — transitions session from 'created' to 'live'.
 */
export const startSession = (sessionId: string) =>
  api.post(`${BASE}/sessions/${sessionId}/start`);

/**
 * Heartbeat — POST every ~30s while broadcasting so the server can detect
 * a host crash within minutes (rather than the 8h wall-clock fallback)
 * and bill only the actual stream time.
 */
export const heartbeat = (sessionId: string) =>
  api.post(`${BASE}/sessions/${sessionId}/heartbeat`);

/**
 * End the live stream. Calculates duration and records usage.
 */
export const endSession = async (sessionId: string) => {
  const res = await api.post(`${BASE}/sessions/${sessionId}/end`);
  createdSessions.delete(sessionId);
  return res;
};

/**
 * List stream sessions for this organisation (`status` defaults to 'live').
 */
export const listSessions = (
  params: { status?: StreamStatus; limit?: number } = { status: 'live', limit: 20 },
) => {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return api.get<{ sessions: StreamListItem[]; total: number }>(`${BASE}/sessions?${query}`);
};
