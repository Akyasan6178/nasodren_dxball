const KEY = 'brickstorm.save.v1';

const DEFAULTS = {
  settings: {
    sfx: true,
    music: true,
    /** 'pointer' | 'keys' | 'both' */
    control: 'both',
  },
  highScores: [],
  unlocked: 1,
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
    return this.data.highScores.length < 10 || score > this.data.highScores[this.data.highScores.length - 1].score;
  }

  addScore(name, score, level) {
    this.data.highScores.push({ name: name.slice(0, 8) || 'PLAYER', score, level });
    this.data.highScores.sort((a, b) => b.score - a.score);
    this.data.highScores.length = Math.min(this.data.highScores.length, 10);
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
