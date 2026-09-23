// Renamed for Revizyon Paketi 14 — a deliberate one-time reset of every
// existing player's local save (high scores, unlock progress, remembered
// name, all of it — this is the whole save blob, not just the score list)
// so old test scores stop showing up for anyone who already has the previous
// key in their browser. Bump the version suffix again for any future reset.
const KEY = 'sinus_ac_local_scores_v1';

/** Local high-score list length. Kept short on purpose — see `addScore`. */
const LOCAL_HIGH_SCORE_MAX = 5;

const DEFAULTS = {
  settings: {
    sfx: true,
    music: true,
    /** 'pointer' | 'keys' | 'both' */
    control: 'both',
  },
  highScores: [],
  unlocked: 1,
  /**
   * Ids of every row this browser has ever inserted into Supabase's global
   * `high_scores` table (see core/leaderboard.js). The global leaderboard
   * has no concept of "this browser" server-side — it is one shared table
   * everyone inserts into — so this list is the only way HighScoresScene can
   * tell the player which of the 20 rows on screen are their own.
   */
  myGlobalScoreIds: [],
  /**
   * The last name typed into ResultsScene's high-score entry, remembered so
   * a returning player is not asked to retype it, and so a run that is not
   * itself a local top-5 can still be submitted to the global leaderboard
   * silently, under whatever name they last used.
   */
  lastPlayerName: '',
};

/**
 * Thin localStorage wrapper. Every read is defensive: private-mode browsers and
 * disabled storage must degrade to an in-memory session, never throw.
 */
export class Save {
  constructor() {
    this.data = structuredClone(DEFAULTS);

    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = {
          ...this.data,
          ...parsed,
          settings: { ...this.data.settings, ...(parsed.settings || {}) },
        };
      }
    } catch {
      /* storage unavailable — session-only save */
    }
  }

  get settings() {
    return this.data.settings;
  }

  get highScores() {
    return this.data.highScores;
  }

  get myGlobalScoreIds() {
    return this.data.myGlobalScoreIds;
  }

  get lastPlayerName() {
    return this.data.lastPlayerName;
  }

  set lastPlayerName(name) {
    this.data.lastPlayerName = name;
    this.flush();
  }

  get unlocked() {
    return this.data.unlocked;
  }

  unlock(level) {
    if (level > this.data.unlocked) {
      this.data.unlocked = level;
      this.flush();
    }
  }

  isHighScore(score) {
    if (score <= 0) return false;
    return (
      this.data.highScores.length < LOCAL_HIGH_SCORE_MAX ||
      score > this.data.highScores[this.data.highScores.length - 1].score
    );
  }

  addScore(name, score, level) {
    this.data.highScores.push({ name: name.slice(0, 8) || 'PLAYER', score, level });
    this.data.highScores.sort((a, b) => b.score - a.score);
    this.data.highScores.length = Math.min(this.data.highScores.length, LOCAL_HIGH_SCORE_MAX);
    this.flush();
  }

  /**
   * Records that this browser's own submission landed as global row `id`, so
   * HighScoresScene can pick it out of the shared table later. Guarded
   * against a duplicate add: `_commit` in ResultsScene only ever calls this
   * once per result in practice, but idempotency here costs nothing and
   * means a caller never has to think about it.
   */
  addGlobalScoreId(id) {
    if (!id || this.data.myGlobalScoreIds.includes(id)) return;
    this.data.myGlobalScoreIds.push(id);
    this.flush();
  }

  reset() {
    this.data = structuredClone(DEFAULTS);
    this.flush();
  }

  flush() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* ignore */
    }
  }
}
