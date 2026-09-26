/* =====================================================================
   Little Sunshine: calm-sounds.js (the "Calm sounds" card, Breathe page)
   Soft background sounds made with the Web Audio API: no audio files,
   so it works offline. Rain, ocean waves, soft wind, and night crickets.
   More than one can play at once; each fades in and out over 2 seconds;
   one volume slider for all. They keep playing during a breathing
   session (this file never listens to the session).

   Loaded in <head> without defer, after shared.js. Fills #calm-sounds
   on DOMContentLoaded; hides it if the browser has no Web Audio.
   ===================================================================== */
(function () {
  'use strict';

  const VOLUME_KEY = 'littleSunshine:calmVolume'; // 0 to 100
  const DEFAULT_VOLUME = 60;
  const FADE = 2;                                 // seconds, in and out

  const AudioCtx = window.AudioContext || window.webkitAudioContext;


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch)
     ------------------------------------------------------------------- */
  function loadVolume() {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY));
      return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v)
        ? Math.min(100, Math.max(0, v)) : DEFAULT_VOLUME;
    } catch (err) {
      return DEFAULT_VOLUME;
    }
  }

  function saveVolume(v) {
    try {
      localStorage.setItem(VOLUME_KEY, String(v));
    } catch (err) { /* it just won't be remembered */ }
  }


  /* -------------------------------------------------------------------
     The mixer: one AudioContext (made on the first tap, as browsers
     require), a master volume, and a gentle compressor so several
     sounds together never clip.
     ------------------------------------------------------------------- */
  let ctx = null;
  let master = null;
  const noise = {};   // looping noise buffers, made once: white, pink, brown

  // Volume feels even when it follows a curve rather than a straight line
  function volumeToGain(v) {
    return Math.pow(v / 100, 2) * 0.9;
  }

  function getContext() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    ctx = new AudioCtx();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    master = ctx.createGain();
    master.gain.value = volumeToGain(loadVolume());
    master.connect(compressor).connect(ctx.destination);
    makeNoise();
    return ctx;
  }

  // Four seconds of each kind of noise, looped
  function makeNoise() {
    const length = ctx.sampleRate * 4;
    ['white', 'pink', 'brown'].forEach((kind) => {
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        if (kind === 'white') {
          data[i] = white * 0.5;
        } else if (kind === 'pink') {
          // Paul Kellet's pink noise filter: softer than white, like steady rain
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.96900 * b2 + white * 0.1538520;
          b3 = 0.86650 * b3 + white * 0.3104856;
          b4 = 0.55000 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.0168980;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        } else {
          // Brown noise: deep and rumbly, like distant sea or wind
          last = (last + 0.02 * white) / 1.02;
          data[i] = last * 3.5;
        }
      }
      noise[kind] = buffer;
    });
  }

  function loop(kind) {
    const src = ctx.createBufferSource();
    src.buffer = noise[kind];
    src.loop = true;
    // Start somewhere random, so two layers never line up
    src.start(ctx.currentTime, Math.random() * 3);
    return src;
  }

  function filter(type, frequency, q) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    if (q != null) f.Q.value = q;
    return f;
  }

  function gain(value) {
    const g = ctx.createGain();
    g.gain.value = value;
    return g;
  }

  // A slow wobble (LFO): adds `depth` * sine(rate) to `param`
  function wobble(param, rate, depth, sources) {
    const osc = ctx.createOscillator();
    osc.frequency.value = rate;
    const amount = gain(depth);
    osc.connect(amount).connect(param);
    osc.start();
    sources.push(osc);
    return osc;
  }

  // Calls `fn` every `ms` while the sound plays (for drops and chirps)
  function every(ms, fn, timers) {
    fn();
    timers.push(setInterval(fn, ms));
  }


  /* -------------------------------------------------------------------
     The four sounds. Each one builds its nodes into `out` and returns
     the sources and timers to stop later.
     ------------------------------------------------------------------- */
  const SOUNDS = {
    // Steady filtered noise, a soft low body, and random light drops
    rain(out) {
      const sources = [];
      const timers = [];

      const bed = loop('pink');
      bed.connect(filter('highpass', 400)).connect(filter('lowpass', 6500)).connect(gain(0.55)).connect(out);
      const body = loop('brown');
      body.connect(filter('lowpass', 320)).connect(gain(0.25)).connect(out);
      sources.push(bed, body);

      // Drops: tiny band-passed clicks of noise, about a dozen a second
      let next = ctx.currentTime + 0.05;
      every(120, () => {
        const until = ctx.currentTime + 0.25;
        // Back from a background tab: skip ahead rather than play a burst of old drops
        if (next < ctx.currentTime) next = ctx.currentTime + 0.02;
        while (next < until) {
          const t = next;
          const drop = ctx.createBufferSource();
          drop.buffer = noise.white;
          const band = filter('bandpass', 1800 + Math.random() * 3200, 7);
          const env = gain(0);
          const peak = 0.12 + Math.random() * 0.28;
          env.gain.setValueAtTime(0, t);
          env.gain.linearRampToValueAtTime(peak, t + 0.004);
          env.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
          drop.connect(band).connect(env).connect(out);
          drop.start(t, Math.random() * 3, 0.08);
          next += 0.02 + Math.random() * 0.14;
        }
      }, timers);

      return { sources, timers };
    },

    // Deep noise whose volume and brightness swell and fall like waves,
    // with a little foamy hiss riding on top
    ocean(out) {
      const sources = [];
      const surf = loop('brown');
      const lowpass = filter('lowpass', 650);
      const swell = gain(0.5);
      surf.connect(lowpass).connect(swell).connect(out);

      const foam = loop('white');
      const foamGain = gain(0.03);
      foam.connect(filter('highpass', 1800)).connect(foamGain).connect(out);
      sources.push(surf, foam);

      // One slow wave about every 12 seconds drives all three together
      const wave = wobble(swell.gain, 0.083, 0.42, sources);
      const bright = gain(380);
      wave.connect(bright).connect(lowpass.frequency);
      const foamy = gain(0.025);
      wave.connect(foamy).connect(foamGain.gain);

      return { sources, timers: [] };
    },

    // Low noise through a band that slowly drifts, getting stronger and softer
    wind(out) {
      const sources = [];
      const air = loop('brown');
      const band = filter('bandpass', 360, 0.7);
      const level = gain(0.6);
      air.connect(band).connect(level).connect(out);
      sources.push(air);

      // Three unhurried wobbles that never quite line up, so it keeps changing
      wobble(band.frequency, 0.047, 170, sources);
      wobble(band.frequency, 0.013, 90, sources);
      wobble(level.gain, 0.061, 0.28, sources);

      return { sources, timers: [] };
    },

    // A hush of night air, and gentle high chirps from a few crickets
    crickets(out) {
      const sources = [];
      const timers = [];

      const night = loop('brown');
      night.connect(filter('lowpass', 220)).connect(gain(0.12)).connect(out);
      sources.push(night);

      // Three crickets, each with its own pitch and place (left to right)
      const crickets = [
        { pitch: 4400, pan: -0.55 },
        { pitch: 4850, pan: 0.35 },
        { pitch: 5300, pan: 0.7 },
      ].map((c) => {
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : gain(1);
        if (pan.pan) pan.pan.value = c.pan;
        pan.connect(out);
        return { pitch: c.pitch, pan: pan, next: ctx.currentTime + 0.3 + Math.random() * 1.5 };
      });

      // A chirp: 3 or 4 quick soft pulses of a high tone
      function chirp(cricket, t) {
        const osc = ctx.createOscillator();
        osc.frequency.value = cricket.pitch;
        const env = gain(0);
        const pulses = 3 + Math.floor(Math.random() * 2);
        for (let k = 0; k < pulses; k++) {
          const p = t + k * 0.055;
          env.gain.setValueAtTime(0, p);
          env.gain.linearRampToValueAtTime(0.06, p + 0.008);
          env.gain.linearRampToValueAtTime(0, p + 0.035);
        }
        osc.connect(env).connect(cricket.pan);
        osc.start(t);
        osc.stop(t + pulses * 0.055 + 0.05);
      }

      every(200, () => {
        const until = ctx.currentTime + 0.4;
        crickets.forEach((c) => {
          if (c.next < ctx.currentTime) c.next = ctx.currentTime + Math.random(); // same as above
          while (c.next < until) {
            chirp(c, c.next);
            c.next += 0.7 + Math.random() * 2.4;
          }
        });
      }, timers);

      return { sources, timers };
    },
  };


  /* -------------------------------------------------------------------
     Play and stop, always with a 2-second fade
     ------------------------------------------------------------------- */
  const playing = {}; // name -> { out, sources, timers }

  function play(name) {
    getContext();
    const now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = 0;                 // silent even before the audio device starts
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(1, now + FADE);
    out.connect(master);
    playing[name] = Object.assign({ out }, SOUNDS[name](out));
  }

  function stop(name) {
    const sound = playing[name];
    if (!sound) return;
    delete playing[name];

    const now = ctx.currentTime;
    const g = sound.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    sound.timers.forEach(clearInterval); // no new drops or chirps while it fades

    setTimeout(() => {
      sound.sources.forEach((s) => { try { s.stop(); } catch (err) { /* already stopped */ } });
      sound.out.disconnect();
      // Nothing left playing: let the audio hardware rest
      if (!Object.keys(playing).length && ctx.state === 'running') ctx.suspend();
    }, FADE * 1000 + 100);
  }

  function setVolume(v) {
    if (!master) return;
    master.gain.setTargetAtTime(volumeToGain(v), ctx.currentTime, 0.08);
  }


  /* -------------------------------------------------------------------
     The card
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const card = document.getElementById('calm-sounds');
    if (!card) return;
    if (!AudioCtx) {
      card.hidden = true;
      return;
    }

    const tiles = Array.from(card.querySelectorAll('[data-sound]'));
    const slider = card.querySelector('#calm-volume');

    function showVolume(v) {
      slider.value = v;
      slider.style.setProperty('--fill', v + '%');
      slider.setAttribute('aria-valuetext', v + '%');
    }

    tiles.forEach((tile) => {
      tile.addEventListener('click', () => {
        const name = tile.dataset.sound;
        const on = !playing[name];
        try {
          if (on) play(name); else stop(name);
        } catch (err) {
          return; // audio unavailable right now: leave the tile as it was
        }
        tile.setAttribute('aria-pressed', on ? 'true' : 'false');
        tile.classList.toggle('is-playing', on);
      });
    });

    showVolume(loadVolume());
    slider.addEventListener('input', () => {
      const v = Number(slider.value);
      showVolume(v);
      setVolume(v);
      saveVolume(v);
    });
  });

  // For checking what's playing (e.g. in tests); not needed by the page
  window.LittleSunshineCalm = {
    playing: () => Object.keys(playing),
    state: () => (ctx ? ctx.state : 'none'),
    level: (name) => (playing[name] && ctx ? playing[name].out.gain.value : 0),
  };
})();
