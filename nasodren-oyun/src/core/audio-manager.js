import { MUSIC, SFX } from '../game/config.js';

/**
 * AudioManager.
 *
 * Everything is synthesised at runtime with the Web Audio API — no sample
 * files, no decode step, no loading delay, and the whole engine costs a few
 * kilobytes. Effects are short oscillator or filtered-noise envelopes; music is
 * a lookahead step sequencer.
 *
 * Three things distinguish this from a plain sound bank:
 *
 *  - **Pitch variance.** Every repeated impact gets a small random detune.
 *    Without it the identical waveform fires dozens of times a second and the
 *    ear starts filtering it out.
 *  - **Combo escalation.** Consecutive brick breaks with no paddle touch climb
 *    in semitones, then reset the moment the ball comes home.
 *  - **Crossfading.** Two sequencers can run at once, each on its own gain bus,
 *    so a track change ramps across instead of cutting.
 *
 * Browsers block audio until a user gesture, so `unlock()` must be called from
 * a real pointer or key event before anything is audible.
 */

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SEMITONE = Math.pow(2, 1 / 12);
const R = -1; // rest

/**
 * Track definitions. 16 sixteenth-note steps each.
 *
 * `pad` is a slow sustained layer used by the menu track — it is what makes
 * that one read as atmospheric rather than as a game loop played slowly.
 */
const TRACKS = {
  menu: {
    bpm: 84,
    wave: 'triangle',
    bass: [33, R, R, R, 31, R, R, R, 28, R, R, R, 31, R, R, R],
    lead: [R, R, 64, R, R, 67, R, R, R, R, 71, R, R, 67, R, R],
    pad: [52, R, R, R, R, R, R, R, 55, R, R, R, R, R, R, R],
    leadGain: 0.14,
  },
  levelA: {
    bpm: 132,
    wave: 'square',
    bass: [45, R, 45, R, 43, R, 43, R, 41, R, 41, R, 43, R, 45, R],
    lead: [69, 72, 76, 72, 67, 71, 74, 71, 65, 69, 72, 69, 67, 71, 74, R],
  },
  levelB: {
    bpm: 146,
    wave: 'sawtooth',
    bass: [38, 38, R, 38, 36, R, 36, R, 34, 34, R, 34, 36, R, 38, R],
    lead: [74, 77, 81, 77, 72, 76, 79, 76, 70, 74, 77, 74, 72, 76, 79, 81],
  },
  levelC: {
    bpm: 160,
    wave: 'square',
    bass: [40, 40, 47, 40, 38, 38, 45, 38, 36, 36, 43, 36, 38, 45, 47, 48],
    lead: [76, 79, 83, 86, 83, 79, 76, 79, 74, 78, 81, 85, 81, 78, 74, R],
  },
  /** O.M.E.G.A. Construct. Driving, chromatic, and fast. */
  boss: {
    bpm: 178,
    wave: 'sawtooth',
    bass: [28, 28, 28, 31, 28, 28, 30, 28, 27, 27, 27, 30, 27, 29, 27, 26],
    lead: [64, 67, 70, 73, 70, 67, 64, 63, 62, 65, 68, 71, 68, 65, 62, 61],
    leadGain: 0.26,
  },
};

/** One running sequencer with its own gain bus, so tracks can overlap. */
class MusicVoice {
  constructor(manager, name) {
    this.manager = manager;
    this.name = name;
    this.track = TRACKS[name];

    const ctx = manager.ctx;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.connect(manager.musicBus);

    this.step = 0;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.timer = null;
    this.stopping = false;
  }

  start() {
    if (this.timer) return;
    // Lookahead scheduling: a coarse JS timer queues precisely-timed audio
    // events slightly ahead of the clock, so timing never jitters with frame rate.
    this.timer = setInterval(() => this._schedule(), 25);
  }

  /** @param {number} value target gain @param {number} seconds ramp time */
  fadeTo(value, seconds) {
    const now = this.manager.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(value, now + Math.max(0.01, seconds));
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    try {
      this.gain.disconnect();
    } catch {
      /* already detached */
    }
  }

  _schedule() {
    const ctx = this.manager.ctx;
    if (!ctx) return;

    const t = this.track;
    const stepDur = 60 / t.bpm / 4;

    while (this.nextStepTime < ctx.currentTime + 0.14) {
      const when = this.nextStepTime - ctx.currentTime;
      const i = this.step % 16;

      if (when >= 0) {
        const bass = t.bass[i];
        if (bass !== R) {
          this.manager._tone({
            type: 'triangle',
            f0: midiToFreq(bass),
            dur: stepDur * 1.7,
            vol: 0.5,
            when,
            bus: this.gain,
          });
        }

        const lead = t.lead[i];
        if (lead !== R) {
          this.manager._tone({
            type: t.wave,
            f0: midiToFreq(lead),
            dur: stepDur * 0.85,
            vol: t.leadGain ?? 0.22,
            when,
            bus: this.gain,
          });
        }

        if (t.pad) {
          const pad = t.pad[i];
          if (pad !== R) {
            this.manager._tone({
              type: 'sine',
              f0: midiToFreq(pad),
              dur: stepDur * 14,
              vol: 0.32,
              when,
              bus: this.gain,
            });
          }
        }
      }

      this.nextStepTime += stepDur;
      this.step++;
    }
  }
}

export class AudioManager {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;

    /** Currently requested track name, or null. */
    this.current = null;
    this._voices = [];

    /** Consecutive brick breaks with no paddle touch. */
    this.combo = 0;
  }

  /* --------------------------------------------------------------- setup */

  /** Must be called from inside a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this._buildGraph();
      if (this.current) this._startVoice(this.current, 0);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  _buildGraph() {
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = MUSIC.level;
    this.musicBus.connect(this.master);

    // One second of white noise, reused by every percussive effect.
    const frames = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  }

  get _sfxReady() {
    return this.ctx && this.settings.sfx;
  }

  /* ---------------------------------------------------------- primitives */

  /** Pitched blip with an optional glide, and an optional pitch multiplier. */
  _tone({ type = 'square', f0, f1 = f0, dur = 0.1, vol = 0.2, when = 0, bus = null, pitch = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0 * pitch, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * pitch), t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    osc.connect(gain).connect(bus || this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Filtered noise burst — impacts, explosions, hats. */
  _noise({ dur = 0.2, vol = 0.3, f0 = 2000, f1 = 400, q = 1, when = 0, type = 'lowpass', pitch = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(f0 * pitch, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, f1 * pitch), t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /** Random detune around unity, so repeats never sound mechanical. */
  _jitter(amount = SFX.pitchVariance) {
    return 1 + (Math.random() * 2 - 1) * amount;
  }

  /* ----------------------------------------------------------------- sfx */

  wallBounce() {
    if (!this._sfxReady) return;
    const p = this._jitter();
    this._tone({ type: 'square', f0: 1180, f1: 820, dur: 0.05, vol: 0.13, pitch: p });
    this._noise({ dur: 0.04, vol: 0.06, f0: 5200, f1: 2600, q: 6, type: 'bandpass', pitch: p });
  }

  /**
   * The ball coming home is what ends a combo, so the reset lives here rather
   * than in the scene — there is no way to touch the paddle without it.
   */
  paddleBounce() {
    this.resetCombo();
    if (!this._sfxReady) return;
    this._tone({ type: 'triangle', f0: 300, f1: 520, dur: 0.08, vol: 0.24, pitch: this._jitter() });
  }

  brickHit(step = 0) {
    if (!this._sfxReady) return;
    this._tone({
      type: 'square',
      f0: midiToFreq(72 + (step % 8)),
      dur: 0.055,
      vol: 0.15,
      pitch: this._jitter(),
    });
  }

  /** Climbs a semitone per consecutive break. */
  brickBreak(step = 0) {
    const combo = Math.min(this.combo, SFX.comboMax);
    this.combo++;

    if (!this._sfxReady) return;

    const pitch = this._jitter() * Math.pow(SEMITONE, combo * SFX.comboSemitone);
    this._tone({
      type: 'square',
      f0: midiToFreq(76 + (step % 8)),
      f1: midiToFreq(88),
      dur: 0.09,
      vol: 0.16,
      pitch,
    });
    this._noise({ dur: 0.1, vol: 0.16, f0: 3600, f1: 900, q: 1.4, type: 'bandpass', pitch });
  }

  resetCombo() {
    this.combo = 0;
  }

  metalPing() {
    if (!this._sfxReady) return;
    const p = this._jitter();
    this._tone({ type: 'square', f0: 1600, f1: 1500, dur: 0.07, vol: 0.1, pitch: p });
    this._noise({ dur: 0.09, vol: 0.09, f0: 6000, f1: 4200, q: 10, type: 'bandpass', pitch: p });
  }

  explosion() {
    if (!this._sfxReady) return;
    const p = this._jitter(0.06);
    this._noise({ dur: 0.45, vol: 0.34, f0: 1600, f1: 90, q: 1.1, pitch: p });
    this._tone({ type: 'sawtooth', f0: 180, f1: 40, dur: 0.35, vol: 0.16, pitch: p });
  }

  laser() {
    if (!this._sfxReady) return;
    this._tone({ type: 'sawtooth', f0: 1500, f1: 240, dur: 0.09, vol: 0.14, pitch: this._jitter() });
  }

  powerUp(good = true) {
    if (!this._sfxReady) return;
    const notes = good ? [72, 76, 79, 84] : [72, 68, 65, 60];
    notes.forEach((n, i) =>
      this._tone({
        type: good ? 'square' : 'sawtooth',
        f0: midiToFreq(n),
        dur: 0.09,
        vol: 0.16,
        when: i * 0.055,
      }),
    );
  }

  extraLife() {
    if (!this._sfxReady) return;
    [72, 76, 79, 84, 88].forEach((n, i) =>
      this._tone({ type: 'triangle', f0: midiToFreq(n), dur: 0.13, vol: 0.2, when: i * 0.07 }),
    );
  }

  lifeLost() {
    this.resetCombo();
    if (!this._sfxReady) return;
    this._tone({ type: 'square', f0: 420, f1: 70, dur: 0.65, vol: 0.22 });
    this._noise({ dur: 0.5, vol: 0.12, f0: 900, f1: 80, q: 2 });
  }

  levelWin() {
    this.resetCombo();
    if (!this._sfxReady) return;
    [72, 76, 79, 84, 79, 84, 88].forEach((n, i) =>
      this._tone({ type: 'square', f0: midiToFreq(n), dur: 0.16, vol: 0.2, when: i * 0.1 }),
    );
  }

  gameOver() {
    if (!this._sfxReady) return;
    [69, 65, 62, 57].forEach((n, i) =>
      this._tone({ type: 'sawtooth', f0: midiToFreq(n), dur: 0.5, vol: 0.2, when: i * 0.26 }),
    );
  }

  uiClick() {
    if (!this._sfxReady) return;
    this._tone({ type: 'square', f0: 880, f1: 1320, dur: 0.06, vol: 0.12, pitch: this._jitter(0.05) });
  }

  uiMove() {
    if (!this._sfxReady) return;
    this._tone({ type: 'square', f0: 620, dur: 0.04, vol: 0.07, pitch: this._jitter(0.05) });
  }

  /* --------------------------------------------------------------- music */

  /**
   * Which track a level index should play.
   * @param {number} levelIndex 0-based
   * @param {boolean} isBoss
   */
  static trackForLevel(levelIndex, isBoss = false) {
    if (isBoss) return 'boss';
    for (const band of MUSIC.levelBands) {
      if (levelIndex <= band.upTo) return band.track;
    }
    return MUSIC.levelBands[MUSIC.levelBands.length - 1].track;
  }

  /** Convenience wrapper used by the gameplay scene. */
  playLevelMusic(levelIndex, isBoss = false) {
    this.playMusic(AudioManager.trackForLevel(levelIndex, isBoss));
  }

  /**
   * Switch tracks with a crossfade. Re-requesting the current track is a no-op,
   * so scenes can call this every frame without restarting anything.
   *
   * @param {string|null} name
   * @param {number} [seconds]
   */
  playMusic(name, seconds = MUSIC.crossfade) {
    if (name !== null && !TRACKS[name]) return;
    if (this.current === name) return;

    this.current = name;

    // Remember the request even before the context exists; unlock() will honour
    // it once the first gesture arrives.
    if (!this.ctx || !this.settings.music) {
      if (!this.settings.music) this._stopAllVoices();
      return;
    }

    this._fadeOutVoices(seconds);
    if (name) this._startVoice(name, seconds);
  }

  _startVoice(name, seconds) {
    if (!this.ctx || !this.settings.music) return;

    const voice = new MusicVoice(this, name);
    voice.start();
    voice.fadeTo(1, seconds);
    this._voices.push(voice);
  }

  _fadeOutVoices(seconds) {
    for (const voice of this._voices) {
      if (voice.stopping) continue;
      voice.stopping = true;
      voice.fadeTo(0, seconds);
      // Tear the sequencer down only after the ramp has finished, or the tail
      // of the outgoing track cuts off mid-fade.
      setTimeout(() => {
        voice.stop();
        const i = this._voices.indexOf(voice);
        if (i >= 0) this._voices.splice(i, 1);
      }, seconds * 1000 + 60);
    }
  }

  _stopAllVoices() {
    for (const voice of this._voices) voice.stop();
    this._voices.length = 0;
  }

  stopMusic(seconds = MUSIC.crossfade) {
    this.current = null;
    this._fadeOutVoices(seconds);
  }

  /**
   * Legacy entry point. The old engine addressed tracks by index; keep it
   * working so nothing that still calls it breaks.
   */
  playTrack(index) {
    this.playLevelMusic(typeof index === 'number' ? index * 4 : 0);
  }

  setMusicEnabled(on) {
    this.settings.music = on;
    if (!on) {
      this._stopAllVoices();
    } else if (this.current) {
      const want = this.current;
      this.current = null;
      this.playMusic(want, 0.3);
    }
  }

  setSfxEnabled(on) {
    this.settings.sfx = on;
  }

  /** Duck everything while the tab is hidden or the game is paused. */
  setMuted(muted) {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.02);
  }
}
