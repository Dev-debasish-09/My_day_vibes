/* =====================================================================
   Little Sunshine: breathe.js (the "Breathe" page)
   A guided breath: in 4s, hold 4s, out 6s, for about 1, 3 or 5 minutes.
   The circle's size (or, with reduced motion, its glow) is driven by
   CSS from data-phase; this file only sets the phase at the right time,
   counts down, and plays an optional soft chime (Web Audio API).
   The profile, sky, and bottom navigation come from shared.js
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
  // `note` is the chime's pitch in Hz: a little higher going in, lower going out
  const PHASES = [
    { key: 'in',   label: 'Breathe in',  ms: 4000, note: 659.25 }, // E5
    { key: 'hold', label: 'Hold',        ms: 4000, note: 587.33 }, // D5
    { key: 'out',  label: 'Breathe out', ms: 6000, note: 493.88 }, // B4
  ];
  const CYCLE_MS = PHASES.reduce((sum, p) => sum + p.ms, 0); // 14s

  const IDLE_TEXT = 'Ready when you are.';
  const DONE_TEXT = 'Well done. Notice how you feel now.';

  const root = document.documentElement;


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  // A session is always whole breaths, so it never stops mid-breath:
  // 1 min = 4 breaths (0:56), 3 min = 13 (3:02), 5 min = 21 (4:54)
  function breathsFor(seconds) {
    return Math.max(1, Math.round((seconds * 1000) / CYCLE_MS));
  }

  // 75 -> "1:15"
  function formatTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
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
  root.style.setProperty('--sun-rise', '0'); // the sun rests behind the hills; the circle is the sun here


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);
    const els = {
      breath: $('breath'),
      phase: $('breath-phase'),
      timer: $('breath-timer'),
      length: $('breath-length'),
      start: $('breath-start'),
      stop: $('breath-stop'),
      sound: $('breath-sound'),
    };

    let soundOn = loadSoundOn();
    // The running session: { end, phaseTimer, tickTimer }, or null
    let session = null;


    /* ---------------- Display ---------------- */
    function chosenSeconds() {
      const checked = els.length.querySelector('input:checked');
      return Number(checked ? checked.value : 60);
    }

    function showIdleTime() {
      els.timer.textContent = formatTime(Math.round(breathsFor(chosenSeconds()) * CYCLE_MS / 1000));
    }

    // `ms` sets how long the circle takes to reach this phase's size
    function setPhase(key, text, ms) {
      els.breath.style.setProperty('--phase-ms', ms + 'ms');
      els.breath.dataset.phase = key;
      els.phase.textContent = text;
    }

    function setRunning(running) {
      els.start.hidden = running;
      els.stop.hidden = !running;
      els.length.disabled = running;
      (running ? els.stop : els.start).focus({ preventScroll: true });
    }

    function updateSoundButton() {
      els.sound.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
      els.sound.textContent = soundOn ? 'Sound: on' : 'Sound: off';
    }


    /* ---------------- The session ---------------- */
    // Each phase is scheduled from the planned start time (not "now"),
    // so small timer delays never add up over 5 minutes
    function runPhase(index, at) {
      const phase = PHASES[index];
      setPhase(phase.key, phase.label, phase.ms);
      if (soundOn) chime(phase.note);

      const next = at + phase.ms;
      const done = next >= session.end - 1; // the last breath out just ended
      session.phaseTimer = setTimeout(
        () => (done ? finish() : runPhase((index + 1) % PHASES.length, next)),
        Math.max(0, next - performance.now())
      );
    }

    function tick() {
      const left = Math.ceil((session.end - performance.now()) / 1000);
      els.timer.textContent = formatTime(left);
    }

    function start() {
      if (session) return;
      if (soundOn) getAudio(); // unlock audio inside the tap
      const now = performance.now();
      session = { end: now + breathsFor(chosenSeconds()) * CYCLE_MS, phaseTimer: 0, tickTimer: 0 };
      setRunning(true);
      tick();
      session.tickTimer = setInterval(tick, 250);
      runPhase(0, now);
    }

    function clearSession() {
      clearTimeout(session.phaseTimer);
      clearInterval(session.tickTimer);
      session = null;
    }

    function stop() {
      if (!session) return;
      clearSession();
      setPhase('idle', IDLE_TEXT, 900);
      showIdleTime();
      setRunning(false);
    }

    function finish() {
      clearSession();
      els.timer.textContent = formatTime(0);
      setPhase('done', DONE_TEXT, 2400); // soft fade, see styles.css
      if (soundOn) {
        chime(523.25);         // C5
        chime(659.25, 0.35);   // E5
      }
      setRunning(false);
    }


    /* ---------------- Start ---------------- */
    renderBottomNav('breathe');
    showIdleTime();
    updateSoundButton();
    if (!AudioCtx) els.sound.parentElement.hidden = true;

    els.start.addEventListener('click', start);
    els.stop.addEventListener('click', stop);

    els.length.addEventListener('change', () => {
      showIdleTime();
      // After a finished session, picking a new length resets the circle
      if (els.breath.dataset.phase === 'done') setPhase('idle', IDLE_TEXT, 900);
    });

    els.sound.addEventListener('click', () => {
      soundOn = !soundOn;
      saveSoundOn(soundOn);
      updateSoundButton();
      if (soundOn) chime(PHASES[0].note); // a quiet sample, so you know what it sounds like
    });
  });
})();
