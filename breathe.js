/* =====================================================================
   Little Sunshine: breathe.js (the "Breathe" page)
   A guided breath with a flower that opens and closes. Three patterns
   (Calm, Box, Sleep) for about 1, 3 or 5 minutes. The flower, ring,
   and drifting lights are driven by CSS from data-phase and --phase-ms;
   this file sets the phase at the right time, counts down, dims the
   sky while you breathe, plays an optional soft chime (Web Audio API),
   and counts finished sessions.
   The profile, sky, sounds, and bottom navigation come from shared.js
   (window.LittleSunshine).

   Loaded in <head> without defer, after shared.js. The top part runs
   right away (apply the sky before first paint); the rest waits for
   DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  const { loadProfile, applySky, renderBottomNav, loadSoundOn, saveSoundOn } = window.LittleSunshine;

  /* -------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------- */
  const SESSIONS_KEY = 'littleSunshine:breathSessions'; // how many sessions were finished
  const BREATHS_KEY = 'littleSunshine:breaths';          // how many full breaths, ever (shown on the Me page)

  // `key` drives the flower (in = open, hold = stay open, out = close,
  // rest = stay closed); `note` is the chime's pitch in Hz
  const PHASE = {
    in:   { key: 'in',   label: 'Breathe in',  note: 659.25 }, // E5
    hold: { key: 'hold', label: 'Hold',        note: 587.33 }, // D5
    out:  { key: 'out',  label: 'Breathe out', note: 493.88 }, // B4
    rest: { key: 'rest', label: 'Hold',        note: 523.25 }, // C5
  };

  const PATTERNS = {
    calm:  [[PHASE.in, 4], [PHASE.hold, 4], [PHASE.out, 6]],
    box:   [[PHASE.in, 4], [PHASE.hold, 4], [PHASE.out, 4], [PHASE.rest, 4]],
    sleep: [[PHASE.in, 4], [PHASE.hold, 7], [PHASE.out, 8]],
  };

  const IDLE_TEXT = 'Ready when you are.';
  const PARTICLE_COUNT = 16;
  const PETAL_COLORS = ['#F7B9C8', '#FFCBA4', '#FFE8A3', '#D6C6F2', '#BFE3CC']; // like the welcome petals
  const SUN_RISE_DONE = 0.16; // the sun peeks over the hills when you finish

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch)
     ------------------------------------------------------------------- */
  function countFinishedSession() {
    try {
      const done = Number(localStorage.getItem(SESSIONS_KEY)) || 0;
      localStorage.setItem(SESSIONS_KEY, String(done + 1));
    } catch (err) { /* it just won't be counted */ }
  }

  // Called each time a full breath (in, hold, out...) is completed,
  // even if the session is stopped early afterwards
  function countBreath() {
    try {
      const done = Number(localStorage.getItem(BREATHS_KEY)) || 0;
      localStorage.setItem(BREATHS_KEY, String(done + 1));
    } catch (err) { /* it just won't be counted */ }
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  function cycleMs(pattern) {
    return pattern.reduce((sum, step) => sum + step[1] * 1000, 0);
  }

  // A session is always whole breaths, so it never stops mid-breath
  // (Calm, 1 min = 4 breaths = 0:56; Box, 5 min = 19 breaths = 5:04)
  function breathsFor(pattern, seconds) {
    return Math.max(1, Math.round((seconds * 1000) / cycleMs(pattern)));
  }

  // 75 -> "1:15"
  function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Restart a CSS animation class, even if it's already on the element
  function replayClass(el, className) {
    el.classList.remove(className);
    void el.getBoundingClientRect(); // force a reflow so the animation starts again
    el.classList.add(className);
  }


  /* -------------------------------------------------------------------
     Soft chime (Web Audio API). The AudioContext is made on the first
     tap, because browsers only allow sound after the person interacts.
     ------------------------------------------------------------------- */
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let audio = null;

  function getAudio() {
    if (!AudioCtx) return null;
    try {
      if (!audio) audio = new AudioCtx();
      if (audio.state === 'suspended') audio.resume();
      return audio;
    } catch (err) {
      return null;
    }
  }

  // A sine tone plus a quiet octave above, fading out like a small bell
  function chime(freq, delay) {
    const ctx = getAudio();
    if (!ctx) return;
    const start = ctx.currentTime + (delay || 0);
    [[freq, 0.07], [freq * 2, 0.018]].forEach(([f, peak]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 2.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 2.5);
    });
  }


  /* -------------------------------------------------------------------
     Run immediately (shared.js has already sent visitors with no
     profile back to the welcome page)
     ------------------------------------------------------------------- */
  const profile = loadProfile();
  if (!profile) return;

  applySky(profile.sky);
  root.style.setProperty('--sun-rise', '0'); // the sun rests behind the hills; the flower has a sun of its own


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);
    const els = {
      breath: $('breath'),
      particles: $('particles'),
      ring: $('ring'),
      words: [$('word-a'), $('word-b')],
      live: $('breath-live'),
      count: $('breath-count'),
      timer: $('breath-timer'),
      stop: $('breath-stop'),
      finish: $('breath-finish'),
      finishTitle: $('finish-title'),
      again: $('breath-again'),
      pattern: $('breath-pattern'),
      length: $('breath-length'),
      start: $('breath-start'),
      sound: $('breath-sound'),
    };

    let soundOn = loadSoundOn();
    // The running session: { start, end, phaseEnd, phaseTimer, tickTimer }, or null
    let session = null;


    /* ---------------- Choices ---------------- */
    function chosenPattern() {
      const checked = els.pattern.querySelector('input:checked');
      return PATTERNS[checked ? checked.value : 'calm'] || PATTERNS.calm;
    }

    function chosenSeconds() {
      const checked = els.length.querySelector('input:checked');
      return Number(checked ? checked.value : 60);
    }

    function showIdleTime() {
      const pattern = chosenPattern();
      els.timer.textContent = formatTime(Math.round(breathsFor(pattern, chosenSeconds()) * cycleMs(pattern) / 1000));
    }


    /* ---------------- Display ---------------- */
    // Cross-fade: the new words go into the hidden layer, then the layers swap
    function showWords(text) {
      const current = els.words.find((w) => w.classList.contains('is-current'));
      const next = els.words.find((w) => w !== current);
      if (current.textContent === text) return;
      next.textContent = text;
      current.classList.remove('is-current');
      next.classList.add('is-current');
    }

    // `ms` is how long the flower takes to reach this phase's shape
    function setPhase(key, text, ms) {
      els.breath.style.setProperty('--phase-ms', ms + 'ms');
      els.breath.dataset.phase = key;
      showWords(text);
      els.live.textContent = key === 'idle' || key === 'done' ? '' : text;
    }

    function setRunning(running) {
      document.body.classList.toggle('is-breathing', running);
      els.stop.hidden = !running;
      els.start.hidden = running;
      els.pattern.disabled = running;
      els.length.disabled = running;
      if (running) els.stop.focus({ preventScroll: true });
    }

    function updateSoundButton() {
      els.sound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      els.sound.textContent = soundOn ? 'Sound: on' : 'Sound: off';
    }

    function setSun(rise) {
      root.style.setProperty('--sun-rise', String(rise));
    }


    /* ---------------- Drifting lights ---------------- */
    // Each light has its own angle, distance, size, and a little delay;
    // CSS moves them toward the flower on "in" and away on "out"
    function addParticles() {
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = document.createElement('span');
        p.className = 'flower-particle';
        p.style.setProperty('--a', Math.round((i / PARTICLE_COUNT) * 360 + Math.random() * 18) + 'deg');
        p.style.setProperty('--near', (0.26 + Math.random() * 0.1).toFixed(2));
        p.style.setProperty('--far', (0.52 + Math.random() * 0.16).toFixed(2));
        p.style.setProperty('--size', (3 + Math.random() * 3).toFixed(1) + 'px');
        p.style.setProperty('--delay', Math.round(Math.random() * 400) + 'ms');
        p.style.setProperty('--po', (0.5 + Math.random() * 0.45).toFixed(2));
        els.particles.appendChild(p);
      }
    }


    /* ---------------- Petals falling once (finish) ---------------- */
    function releasePetals() {
      if (reducedMotion.matches) return;
      const layer = document.createElement('div');
      layer.className = 'petals';
      layer.setAttribute('aria-hidden', 'true');

      const count = window.innerWidth < 720 ? 20 : 30;
      let longest = 0;
      for (let i = 0; i < count; i++) {
        const petal = document.createElement('span');
        const duration = 7 + Math.random() * 5;   // seconds to fall
        const delay = Math.random() * 3;
        longest = Math.max(longest, duration + delay);

        petal.className = 'petal';
        petal.style.setProperty('--x', (Math.random() * 100).toFixed(2) + '%');
        petal.style.setProperty('--dur', duration.toFixed(2) + 's');
        petal.style.setProperty('--delay', delay.toFixed(2) + 's');
        petal.style.setProperty('--size', (9 + Math.random() * 7).toFixed(1) + 'px');
        petal.style.setProperty('--sway', (1.8 + Math.random() * 1.6).toFixed(2) + 's');
        petal.style.setProperty('--c', PETAL_COLORS[i % PETAL_COLORS.length]);
        petal.appendChild(document.createElement('i'));
        layer.appendChild(petal);
      }
      document.body.appendChild(layer);
      setTimeout(() => layer.remove(), longest * 1000 + 500);
    }


    /* ---------------- The session ---------------- */
    // Each phase is scheduled from the planned start time (not "now"),
    // so small timer delays never add up over 5 minutes
    function runPhase(pattern, index, at) {
      const [phase, seconds] = pattern[index];
      const ms = seconds * 1000;
      setPhase(phase.key, phase.label, ms);
      session.phaseEnd = at + ms;
      if (soundOn) chime(phase.note);

      // The ring fills once per full breath (and a new breath means one just finished)
      if (index === 0) {
        if (at > session.start) countBreath();
        els.ring.style.setProperty('--cycle-ms', cycleMs(pattern) + 'ms');
        replayClass(els.ring, 'is-filling');
      }

      const next = at + ms;
      const done = next >= session.end - 1; // the last phase of the last breath just ended
      session.phaseTimer = setTimeout(
        () => (done ? finish() : runPhase(pattern, (index + 1) % pattern.length, next)),
        Math.max(0, next - performance.now())
      );
      tick();
    }

    // Countdown for this phase (4, 3, 2, 1) and time left overall
    function tick() {
      const now = performance.now();
      els.count.textContent = Math.max(1, Math.ceil((session.phaseEnd - now) / 1000));
      els.timer.textContent = formatTime(Math.ceil((session.end - now) / 1000));
    }

    function start() {
      if (session) return;
      if (soundOn) getAudio(); // unlock audio inside the tap
      const pattern = chosenPattern();
      const now = performance.now();

      els.finish.hidden = true;
      setSun(0);
      session = { start: now, end: now + breathsFor(pattern, chosenSeconds()) * cycleMs(pattern), phaseEnd: now, phaseTimer: 0, tickTimer: 0 };
      session.tickTimer = setInterval(tick, 250);
      runPhase(pattern, 0, now);
      // After the first phase is set, so Stop is showing when it takes focus
      setRunning(true);
      els.breath.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }

    function clearSession() {
      clearTimeout(session.phaseTimer);
      clearInterval(session.tickTimer);
      session = null;
      els.ring.classList.remove('is-filling');
      els.count.textContent = '';
    }

    function stop() {
      if (!session) return;
      clearSession();
      setPhase('idle', IDLE_TEXT, 1200);
      showIdleTime();
      setRunning(false);
      els.start.focus({ preventScroll: true });
    }

    async function finish() {
      clearSession();
      countBreath();           // the last breath
      countFinishedSession();
      els.timer.textContent = formatTime(0);
      setPhase('done', '', 2400); // the flower closes softly
      setRunning(false);           // the overlay lifts, the page comes back
      setSun(SUN_RISE_DONE);       // and the sun peeks over the hills
      if (soundOn) {
        chime(523.25);         // C5
        chime(659.25, 0.35);   // E5
      }
      releasePetals();

      await wait(reducedMotion.matches ? 0 : 600);
      els.finish.hidden = false;
      els.finishTitle.focus({ preventScroll: true });
      els.finish.scrollIntoView({ block: 'nearest', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
    }


    /* ---------------- Start ---------------- */
    renderBottomNav('breathe');
    addParticles();
    showIdleTime();
    updateSoundButton();
    if (!AudioCtx) els.sound.parentElement.hidden = true;

    els.start.addEventListener('click', start);
    els.stop.addEventListener('click', stop);
    els.again.addEventListener('click', start);

    // A new pattern or length: show its time, and reset a finished flower
    [els.pattern, els.length].forEach((group) => group.addEventListener('change', () => {
      showIdleTime();
      if (els.breath.dataset.phase === 'done') {
        els.finish.hidden = true;
        setSun(0);
        setPhase('idle', IDLE_TEXT, 1200);
      }
    }));

    els.sound.addEventListener('click', () => {
      soundOn = !soundOn;
      saveSoundOn(soundOn);
      updateSoundButton();
      if (soundOn) chime(PHASE.in.note); // a quiet sample, so you know what it sounds like
    });
  });
})();
