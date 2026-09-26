/* =====================================================================
   Little Sunshine: me.js (the "Me" page)
   Your name and joined date on a little sky card, a daily mood check-in,
   your garden this week (each day's mood grows a flower), a few gentle
   numbers, saved favorites as a swipeable row (with remove), settings
   (sounds, reset everything), and a support card (static, in me.html).
   The profile, sky, sounds, toast, and bottom navigation come from
   shared.js (window.LittleSunshine).

   Loaded in <head> without defer, after shared.js. The top part runs
   right away (apply the sky before first paint); the rest waits for
   DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  const {
    loadProfile, applySky, showToast, renderBottomNav, todayKey,
    loadSoundOn, saveSoundOn, clearAllData, SITE_URL,
  } = window.LittleSunshine;   // SITE_URL: the website's address, set in shared.js

  /* -------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------- */
  const MOODS_KEY = 'littleSunshine:moods';         // { "YYYY-MM-DD": "good", ... }
  const FAVORITES_KEY = 'littleSunshine:favorites'; // written by home.js
  const KINDNESS_KEY = 'littleSunshine:kindness';   // written by home.js
  const JOYS_KEY = 'littleSunshine:joys';           // written by joy.js
  const BREATHS_KEY = 'littleSunshine:breaths';     // written by breathe.js
  const REMINDER_KEY = 'littleSunshine:reminderTime'; // "08:00"

  const SHARE_TEXT = 'Little Sunshine, a little place to feel lighter every day. Made by Debasish. Try it:';
  const SIGNATURE_TAPS = 5; // taps on the signature for the little thank-you

  const REMINDER = {
    title: 'Your little sunshine is waiting ☀️',
    minutes: 5,
    defaultTime: '08:00',
    fileName: 'little-sunshine-reminder.ics',
  };

  // Low moods get comfort, never forced cheer.
  // In the garden, a better mood means more petals and a taller stem.
  const MOODS = {
    'very-low': { label: 'Very low', petals: 3, stem: 34, size: 0.8,
      reply: 'Thank you for telling me. Hard days are allowed. Be as gentle with yourself as you can.' },
    'low':      { label: 'Low',      petals: 4, stem: 42, size: 0.88,
      reply: "That sounds heavy. You don't have to fix anything right now. I'm glad you're here." },
    'okay':     { label: 'Okay',     petals: 5, stem: 52, size: 0.95,
      reply: 'Okay is a perfectly good place to be.' },
    'good':     { label: 'Good',     petals: 6, stem: 62, size: 1,
      reply: "I'm really glad. Keep a little of that for later." },
    'great':    { label: 'Great',    petals: 8, stem: 72, size: 1.08,
      reply: 'That makes me so happy. Maybe it deserves a star in your joy jar?' },
  };

  // The garden's hill (see me.html): a curve from (0,146) over (175,104) to (350,146)
  const GARDEN = { width: 350, days: 7, edge: 146, peak: 104 };

  const DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const root = document.documentElement;


  /* -------------------------------------------------------------------
     Storage (always wrapped in try/catch: private mode or blocked
     storage must never break the page)
     ------------------------------------------------------------------- */
  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch (err) {
      return null;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Only well-formed days with a known mood
  function loadMoods() {
    const data = readJson(MOODS_KEY);
    const moods = {};
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      Object.keys(data).forEach((day) => {
        if (DAY_DATE.test(day) && MOODS[data[day]]) moods[day] = data[day];
      });
    }
    return moods;
  }

  // Same shape home.js saves: { type: "quote" | "poem", text, author, savedAt }
  function loadFavorites() {
    const list = readJson(FAVORITES_KEY);
    return Array.isArray(list)
      ? list.filter((f) => f && (f.type === 'quote' || f.type === 'poem') && typeof f.text === 'string' && f.text)
      : [];
  }

  function countKindness() {
    const list = readJson(KINDNESS_KEY);
    return Array.isArray(list) ? list.filter((d) => typeof d === 'string' && DAY_DATE.test(d)).length : 0;
  }

  function countJoys() {
    const list = readJson(JOYS_KEY);
    return Array.isArray(list)
      ? list.filter((j) => j && typeof j.text === 'string' && j.text.trim()).length
      : 0;
  }

  function loadReminderTime() {
    try {
      const t = localStorage.getItem(REMINDER_KEY);
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : REMINDER.defaultTime;
    } catch (err) {
      return REMINDER.defaultTime;
    }
  }

  function countBreaths() {
    const n = Number(readJson(BREATHS_KEY));
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  function dateFromKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // "20 September", plus the year if it isn't this year
  function formatDay(date) {
    const options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString('en-GB', options);
  }

  // The last 7 days as dates, oldest first, today last
  function lastSevenDays() {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) =>
      new Date(today.getFullYear(), today.getMonth(), today.getDate() - (6 - i)));
  }

  // Newest first; favorites saved before savedAt existed go last
  function bySavedAtDesc(a, b) {
    return (Date.parse(b.savedAt) || 0) - (Date.parse(a.savedAt) || 0);
  }

  // Height of the garden's hill at x (the quadratic curve in me.html)
  function hillY(x) {
    const t = x / GARDEN.width;
    return (1 - t) * (1 - t) * GARDEN.edge + 2 * t * (1 - t) * GARDEN.peak + t * t * GARDEN.edge;
  }

  // Restart a CSS animation class, even if it's already on the element
  function replayClass(el, className) {
    el.classList.remove(className);
    void el.getBoundingClientRect(); // force a reflow so the animation starts again
    el.classList.add(className);
  }

  /* -------------------------------------------------------------------
     Calendar reminder (.ics). Browsers can't reliably schedule
     notifications without a server, so the phone's calendar does it:
     a 5-minute event every day at the chosen time, with an alert.
     ------------------------------------------------------------------- */
  function siteUrl() {
    return SITE_URL || (window.location.origin + '/');
  }

  // Text values in .ics escape \ ; , and line breaks
  function icsText(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  // .ics lines may be at most 75 bytes; longer ones continue on the next
  // line after a space (never splitting a character like the sun emoji)
  function icsFold(line) {
    const encoder = new TextEncoder();
    const parts = [];
    let current = '';
    let bytes = 0;
    for (const ch of line) {
      const size = encoder.encode(ch).length;
      const limit = parts.length ? 74 : 75; // continuation lines start with a space
      if (bytes + size > limit) {
        parts.push(current);
        current = '';
        bytes = 0;
      }
      current += ch;
      bytes += size;
    }
    parts.push(current);
    return parts.join('\r\n ');
  }

  // 20260927T080000 (local "floating" time: 8:00 stays 8:00 wherever you are)
  function icsLocal(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate()) +
      'T' + pad(date.getHours()) + pad(date.getMinutes()) + '00';
  }

  // 20260926T101500Z (UTC, for the file's own timestamp)
  function icsUtc(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  function buildReminderIcs(time) {
    const [hours, minutes] = time.split(':').map(Number);
    const now = new Date();
    // The first one: today if the time is still ahead, otherwise tomorrow
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    if (start <= now) start.setDate(start.getDate() + 1);

    const url = siteUrl();
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Little Sunshine//Daily reminder//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '@little-sunshine',
      'DTSTAMP:' + icsUtc(now),
      'DTSTART:' + icsLocal(start),
      'DURATION:PT' + REMINDER.minutes + 'M',
      'RRULE:FREQ=DAILY',
      'SUMMARY:' + icsText(REMINDER.title),
      'DESCRIPTION:' + icsText('A little moment for you, today. Open Little Sunshine: ' + url),
      'URL:' + url,
      'TRANSP:TRANSPARENT', // shows as free time, it never blocks your day
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + icsText(REMINDER.title),
      'TRIGGER;RELATED=START:PT0M', // the alert rings at the event time
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ];
    return lines.map(icsFold).join('\r\n') + '\r\n';
  }

  function downloadFile(text, fileName, type) {
    const blob = new Blob([text], { type: type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* -------------------------------------------------------------------
     Sharing: the Web Share sheet where there is one, otherwise the
     link is copied. The QR code is made here too (lib/qrcode.js).
     ------------------------------------------------------------------- */
  // Copy text; navigator.clipboard needs https or localhost, so fall back
  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) { /* try the fallback below */ }
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch (err) {
      return false;
    }
  }

  // The QR code as an SVG: one path of little squares, with a quiet border
  function qrSvg(text) {
    const qr = window.qrcode(0, 'M'); // 0 = smallest size that fits; M = medium error correction
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const border = 2;
    let d = '';
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) d += 'M' + (col + border) + ' ' + (row + border) + 'h1v1h-1z';
      }
    }
    const size = count + border * 2;
    const svg = svgEl('svg', {
      viewBox: `0 0 ${size} ${size}`,
      role: 'img',
      'aria-label': 'QR code for ' + text,
      'shape-rendering': 'crispEdges',
    });
    svg.appendChild(svgEl('path', { class: 'share__qr-dots', d: d }));
    return svg;
  }

  function svgEl(name, attrs) {
    const el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach((key) => el.setAttribute(key, attrs[key]));
    return el;
  }


  /* -------------------------------------------------------------------
     Run immediately (shared.js has already sent visitors with no
     profile back to the welcome page)
     ------------------------------------------------------------------- */
  const profile = loadProfile();
  if (!profile) return;

  applySky(profile.sky);
  root.style.setProperty('--sun-rise', '0'); // the page's sun rests; the sky card has its own


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);
    const els = {
      name: $('me-name'),
      since: $('me-since'),
      moods: $('moods'),
      reply: $('mood-reply'),
      plants: $('garden-plants'),
      days: $('garden-days'),
      countJoys: $('count-joys'),
      countKindness: $('count-kindness'),
      countBreaths: $('count-breaths'),
      favorites: $('favorites'),
      favoritesEmpty: $('favorites-empty'),
      sound: $('sound-toggle'),
      resetOpen: $('reset-open'),
      resetConfirm: $('reset-confirm'),
      resetCancel: $('reset-cancel'),
      resetYes: $('reset-yes'),
      reminderTime: $('reminder-time'),
      reminderAdd: $('reminder-add'),
      share: $('share-button'),
      about: $('about'),
      signature: $('signature'),
      hearts: $('signature-hearts'),
      qrWrap: $('share-qr-wrap'),
      qr: $('share-qr'),
    };


    /* ---------------- Header ---------------- */
    function fillHeader() {
      els.name.textContent = profile.name;
      els.since.textContent = 'Here since ' + formatDay(dateFromKey(profile.joinedDate));
    }


    /* ---------------- Mood check-in ---------------- */
    // The reply is a live region, so a new choice is read out
    function showMood(mood) {
      els.moods.querySelectorAll('.mood__input').forEach((input) => {
        input.checked = input.value === mood;
      });
      els.reply.textContent = mood ? MOODS[mood].reply : '';
    }

    // Choosing again the same day just replaces today's mood
    function onMoodChange(event) {
      const mood = event.target.value;
      const moods = loadMoods();
      moods[todayKey()] = mood;
      if (!writeJson(MOODS_KEY, moods)) {
        showToast("I couldn't save that on this device, sorry.");
      }
      showMood(mood);
      replayClass(els.reply, 'is-new');
      renderGarden(moods, todayKey()); // only today's flower grows again
    }


    /* ---------------- Your garden this week ---------------- */
    // A flower: a stem, a leaf for okay and up, and a bloom whose petal
    // count and size follow the mood
    function createFlower(x, base, mood) {
      const m = MOODS[mood];
      const top = base - m.stem;
      const group = svgEl('g', { class: 'garden__plant-body' });

      group.appendChild(svgEl('path', {
        class: 'garden__stem',
        d: `M${x} ${base} Q${x - 5} ${base - m.stem / 2} ${x} ${top}`,
        pathLength: 1,
      }));

      if (m.petals >= 5) {
        const y = base - m.stem * 0.42;
        group.appendChild(svgEl('path', {
          class: 'garden__leaf',
          d: `M${x - 2} ${y}q8-9 17-5q-7 9-17 5z`,
        }));
      }

      // The outer <g> places the bloom; the inner one is what grows (a CSS
      // animation on the outer one would replace its position)
      const place = svgEl('g', { transform: `translate(${x} ${top})` });
      const bloom = svgEl('g', { class: 'garden__bloom' });
      const s = m.size;
      for (let k = 0; k < m.petals; k++) {
        bloom.appendChild(svgEl('ellipse', {
          class: 'garden__petal',
          cx: 0, cy: (-7 * s).toFixed(1), rx: (5 * s).toFixed(1), ry: (8.5 * s).toFixed(1),
          transform: `rotate(${(k * 360) / m.petals})`,
        }));
      }
      bloom.appendChild(svgEl('circle', { class: 'garden__center', r: (4.2 * s).toFixed(1) }));
      place.appendChild(bloom);
      group.appendChild(place);
      return group;
    }

    // No mood that day: a small seed resting in the ground (never anything sad)
    function createSeed(x, base) {
      const group = svgEl('g', { class: 'garden__seed-group' });
      group.append(
        svgEl('path', { class: 'garden__mound', d: `M${x - 9} ${base + 1}q9-6 18 0` }),
        svgEl('ellipse', { class: 'garden__seed', cx: x, cy: base - 1, rx: 4.2, ry: 3, transform: `rotate(-18 ${x} ${base - 1})` }),
        svgEl('circle', { class: 'garden__seed-shine', cx: x - 1.4, cy: base - 2, r: 0.9 })
      );
      return group;
    }

    // `grow`: "all" (the page just opened), a day key (only that day), or nothing
    function renderGarden(moods, grow) {
      const today = todayKey();
      const colWidth = GARDEN.width / GARDEN.days;

      const plants = [];
      const days = [];
      lastSevenDays().forEach((date, i) => {
        const key = todayKey(date);
        const mood = moods[key];
        const x = colWidth * i + colWidth / 2;
        const base = hillY(x) + 2;

        const plant = svgEl('g', { class: 'garden-plant' });
        plant.style.setProperty('--d', (i * 90) + 'ms');
        if (mood) plant.setAttribute('data-mood', mood);
        if (grow === 'all' || grow === key) plant.classList.add('is-growing');
        if (grow === key) plant.style.setProperty('--d', '0ms');
        plant.appendChild(mood ? createFlower(x, base, mood) : createSeed(x, base));
        plants.push(plant);

        // Day letter, and what screen readers hear
        const dayName = date.toLocaleDateString('en-GB', { weekday: 'long' });
        const item = document.createElement('li');
        item.className = 'garden__day' + (key === today ? ' is-today' : '');
        const letter = document.createElement('span');
        letter.setAttribute('aria-hidden', 'true');
        letter.textContent = dayName.charAt(0);
        const spoken = document.createElement('span');
        spoken.className = 'visually-hidden';
        spoken.textContent = (key === today ? 'Today' : dayName) + ': ' +
          (mood ? MOODS[mood].label.toLowerCase() + ' flower' : 'a seed, no check-in');
        item.append(letter, spoken);
        days.push(item);
      });

      els.plants.replaceChildren(...plants);
      els.days.replaceChildren(...days);
    }


    /* ---------------- Little numbers ---------------- */
    function renderNumbers() {
      els.countJoys.textContent = countJoys();
      els.countKindness.textContent = countKindness();
      els.countBreaths.textContent = countBreaths();
    }


    /* ---------------- Favorites: a swipeable row of cards ---------------- */
    // Removing takes two taps: the first turns the corner button into "Remove?"
    function armRemove(button) {
      if (button.classList.contains('is-armed')) return true;
      button.classList.add('is-armed');
      button.querySelector('.fav-card__remove-text').textContent = 'Remove?';
      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('is-armed');
        button.querySelector('.fav-card__remove-text').textContent = '';
      }, 3000);
      return false;
    }

    function removeFavorite(fav, button) {
      if (!armRemove(button)) return;
      // Match on the saved list (not our copy), in case another tab changed it
      const next = loadFavorites().filter((f) => !(f.type === fav.type && f.text === fav.text));
      if (!writeJson(FAVORITES_KEY, next)) {
        showToast("I couldn't change that on this device, sorry.");
        return;
      }
      renderFavorites();
      showToast('Removed from your favorites.');
      // Keep keyboard focus in the row, not lost at the top of the page
      const first = els.favorites.querySelector('.fav-card__remove');
      (first || $('favorites-title')).focus();
    }

    function createFavoriteCard(fav, index) {
      const card = document.createElement('li');
      card.className = 'fav-card fav-card--' + (index % 5);

      const text = document.createElement('p');
      text.className = 'fav-card__text fav-card__text--' + fav.type;
      text.textContent = fav.text; // poems keep their line breaks (CSS pre-line)

      const meta = document.createElement('p');
      meta.className = 'fav-card__meta';
      meta.textContent = fav.type === 'poem' ? 'Poem' : (fav.author ? '— ' + fav.author : 'Quote');

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fav-card__remove';
      remove.setAttribute('aria-label', 'Remove from favorites: ' + fav.text.split('\n')[0]);
      remove.innerHTML =
        '<span class="fav-card__remove-text"></span>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17"/></svg>';
      remove.addEventListener('click', () => removeFavorite(fav, remove));

      card.append(remove, text, meta);
      return card;
    }

    function renderFavorites() {
      const favorites = loadFavorites().sort(bySavedAtDesc);
      els.favoritesEmpty.hidden = favorites.length > 0;
      els.favorites.hidden = favorites.length === 0;
      els.favorites.replaceChildren(...favorites.map(createFavoriteCard));
    }


    /* ---------------- Settings: sounds ---------------- */
    function showSound(on) {
      els.sound.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    function toggleSound() {
      const on = els.sound.getAttribute('aria-checked') !== 'true';
      if (!saveSoundOn(on)) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }
      showSound(on);
    }


    /* ---------------- Settings: daily reminder ---------------- */
    function saveReminderTime() {
      const t = els.reminderTime.value;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return; // cleared or half typed: keep the last good one
      try {
        localStorage.setItem(REMINDER_KEY, t);
      } catch (err) { /* it just won't be remembered */ }
    }

    function addReminder() {
      saveReminderTime();
      const time = loadReminderTime();
      els.reminderTime.value = time;
      downloadFile(buildReminderIcs(time), REMINDER.fileName, 'text/calendar;charset=utf-8');
      showToast('Your reminder is ready. Open it to add it to your calendar.');
    }


    /* ---------------- Settings: share Little Sunshine ---------------- */
    async function shareApp() {
      const url = siteUrl();
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'Little Sunshine', text: SHARE_TEXT, url: url });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return; // the share sheet was closed
          // Anything else: fall through and copy instead
        }
      }
      const ok = await copyText(url);
      showToast(ok ? 'Link copied.' : "Couldn't copy the link, sorry.");
    }

    function showQr() {
      if (typeof window.qrcode !== 'function') {
        els.qrWrap.hidden = true; // the QR library didn't load: just the share button
        return;
      }
      try {
        els.qr.replaceChildren(qrSvg(siteUrl()));
      } catch (err) {
        els.qrWrap.hidden = true;
      }
    }


    /* ---------------- About: the signature ---------------- */
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Written by hand the first time the card is on screen (instantly with reduced motion)
    function setupSignature() {
      if (reducedMotion.matches || !('IntersectionObserver' in window)) return;
      els.about.classList.add('is-waiting');
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        // Wait for the script font, so the pen draws the real letters
        const fontReady = document.fonts && document.fonts.load
          ? document.fonts.load('600 35px "Dancing Script"').catch(() => {})
          : Promise.resolve();
        fontReady.then(() => {
          els.about.classList.remove('is-waiting');
          els.about.classList.add('is-writing');
        });
      }, { threshold: 0.6 });
      observer.observe(els.signature);
    }

    // Five quick taps: hearts, and a thank-you
    let taps = 0;
    let tapTimer = 0;
    function onSignatureTap() {
      taps += 1;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => { taps = 0; }, 1500); // taps must be close together
      if (taps < SIGNATURE_TAPS) return;
      taps = 0;
      showToast('Thank you for being here \u2661');
      if (reducedMotion.matches) return;
      const group = document.createElement('div');
      group.className = 'about__burst';
      for (let i = 0; i < 12; i++) {
        const heart = document.createElement('span');
        heart.className = 'smile-particle smile-particle--heart';
        const angle = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const distance = 70 + Math.random() * 50;
        heart.style.setProperty('--dx', (Math.cos(angle) * distance).toFixed(1) + 'px');
        heart.style.setProperty('--dy', (Math.sin(angle) * distance * 0.7 - 20).toFixed(1) + 'px');
        heart.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 90) + 'deg');
        heart.style.setProperty('--delay', Math.round(Math.random() * 80) + 'ms');
        group.appendChild(heart);
      }
      els.hearts.appendChild(group);
      setTimeout(() => group.remove(), 1200);
    }


    /* ---------------- Settings: reset everything ---------------- */
    function setResetOpen(open) {
      els.resetConfirm.hidden = !open;
      els.resetOpen.hidden = open;
      els.resetOpen.setAttribute('aria-expanded', open ? 'true' : 'false');
      (open ? els.resetCancel : els.resetOpen).focus();
    }

    function resetEverything() {
      if (!clearAllData()) {
        showToast("I couldn't clear this device, sorry.");
        return;
      }
      // Nothing saved any more: start again at the welcome page
      window.location.replace('./');
    }


    /* ---------------- Start ---------------- */
    renderBottomNav('me');
    fillHeader();

    const moods = loadMoods();
    showMood(moods[todayKey()] || null);
    renderGarden(moods, 'all'); // the flowers grow up as the page opens
    renderNumbers();
    renderFavorites();
    showSound(loadSoundOn());
    els.reminderTime.value = loadReminderTime();
    showQr();
    setupSignature();

    els.moods.addEventListener('change', onMoodChange);
    els.sound.addEventListener('click', toggleSound);
    els.reminderTime.addEventListener('change', saveReminderTime);
    els.reminderAdd.addEventListener('click', addReminder);
    els.share.addEventListener('click', shareApp);
    els.signature.addEventListener('click', onSignatureTap);
    els.resetOpen.addEventListener('click', () => setResetOpen(true));
    els.resetCancel.addEventListener('click', () => setResetOpen(false));
    els.resetYes.addEventListener('click', resetEverything);
  });
})();
