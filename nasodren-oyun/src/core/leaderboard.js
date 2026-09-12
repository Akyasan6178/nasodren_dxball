import { createClient } from '@supabase/supabase-js';

/** The one table this module ever touches. */
const TABLE = 'high_scores';

/**
 * Ceiling on how long a request may hang before this class gives up on it
 * and reports failure anyway.
 *
 * MEASURED, NOT GUESSED. A genuinely severed connection (an ad-blocker
 * killing the request outright, or DNS failing) does not reject fast — the
 * underlying client retries several times first, and blocking every request
 * to `*.supabase.co` in a real test left `fetchTop` hanging for ~7.2s before
 * it settled on its own. That is a long time for HighScoresScene's global
 * column to sit on "Yükleniyor..." with no feedback, so this class races
 * every request against its own shorter clock instead of trusting the
 * client's retry policy to be quick about failing.
 */
const REQUEST_TIMEOUT_MS = 5000;

/**
 * Global leaderboard over Supabase.
 *
 * EVERY METHOD IS BEST-EFFORT AND NEVER THROWS. No internet connection, an
 * ad-blocker filtering the Supabase request, a missing/misconfigured
 * `.env`, the table not existing yet, a cold-started project timing out —
 * none of these are the game's problem to crash over. Every failure mode
 * collapses to the same caller-visible signal (`null`), and the two scenes
 * that use this class (ResultsScene, HighScoresScene) already treat `null`
 * as "could not reach the leaderboard" rather than as an empty result.
 *
 * The local save (see core/save.js) is a completely separate system and
 * never routes through here — a broken or absent Supabase project must
 * never take the player's own best-5 list down with it.
 */
export class Leaderboard {
  constructor() {
    // import.meta.env values are inlined at build time; a missing .env
    // entry comes through as undefined, not an empty string, so this check
    // is enough to catch "the project was cloned without secrets" as well
    // as "the vars were never set".
    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // createClient() itself only throws on a malformed URL, which a missing
    // env var would otherwise cause — so the guard has to come first rather
    // than wrapping the constructor call in a try/catch.
    this.client = url && anonKey ? createClient(url, anonKey) : null;

    if (!this.client) {
      console.warn('[leaderboard] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing — global leaderboard disabled.');
    }
  }

  /** Whether a client was constructed at all. Does not mean the network is up. */
  get available() {
    return this.client !== null;
  }

  /**
   * Races a Supabase request against REQUEST_TIMEOUT_MS. Resolves to the
   * request's own `{ data, error }` shape, or to `{ error: true }` if the
   * clock wins instead — either way the caller reads `error` the same way,
   * so this is the only place that needs to know a timeout is even possible.
   */
  _withTimeout(request) {
    return Promise.race([
      request,
      new Promise((resolve) => setTimeout(() => resolve({ error: true, timedOut: true }), REQUEST_TIMEOUT_MS)),
    ]);
  }

  /**
   * Insert one row. Resolves to the new row's id (a UUID string) on success,
   * or `null` on absolutely any failure — missing client, offline, blocked,
   * RLS rejection, malformed response, or a request that simply took too
   * long to fail on its own (see REQUEST_TIMEOUT_MS).
   *
   * @param {string} name
   * @param {number} score
   * @param {number} level
   * @returns {Promise<string|null>}
   */
  async submitScore(name, score, level) {
    if (!this.client) return null;

    try {
      const { data, error } = await this._withTimeout(
        this.client.from(TABLE).insert({ player_name: name, score, level }).select('id').single(),
      );

      if (error || !data?.id) return null;
      return data.id;
    } catch {
      // Covers a thrown network error (offline, DNS failure) and a request
      // an ad-blocker killed outright before it ever reached Supabase.
      return null;
    }
  }

  /**
   * Top N rows by score, descending.
   *
   * Resolves to `null` on failure — NOT an empty array, which is the
   * legitimate "the table is empty" result and must read differently in the
   * UI (an empty leaderboard vs. one that could not be reached).
   *
   * @param {number} limit
   * @returns {Promise<Array<{id:string,player_name:string,score:number,level:number}>|null>}
   */
  async fetchTop(limit = 20) {
    if (!this.client) return null;

    try {
      const { data, error } = await this._withTimeout(
        this.client.from(TABLE).select('id, player_name, score, level').order('score', { ascending: false }).limit(limit),
      );

      if (error) return null;
      return data ?? [];
    } catch {
      return null;
    }
  }
}
