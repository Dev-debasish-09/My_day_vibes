/* =====================================================================
   Little Sunshine: letters-shared.js ("Letters to future me")
   Everything more than one page needs for letters: saving them, date
   math, the envelope drawing, and opening a letter (an envelope that
   unseals, opens, and lets the letter rise out). It also fills two
   small cards when their spot is on the page:
     #letter-arrived  (Today page)  "A letter from past you has arrived."
     #letters-summary (Me page)     "2 waiting · the next opens on 23 October"
   Exposed as window.LittleSunshineLetters.

   Load after shared.js (it uses window.LittleSunshine), before the
   page's own script.
   ===================================================================== */
(function () {
  'use strict';

  const { todayKey, haptic } = window.LittleSunshine;

  const LETTERS_KEY = 'littleSunshine:letters';
  const MAX_TEXT = 2000;

  // "Open it in..." choices: days or months from today
  const WHEN = {
    '1w': { days: 7 },
    '1m': { months: 1 },
    '3m': { months: 3 },
    '6m': { months: 6 },
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const DAY_DATE = /^\d{4}-\d{2}-\d{2}$/;


  /* -------------------------------------------------------------------
     Storage: [{ id, text, writtenOn, opensOn, openedOn }]
     Dates are "YYYY-MM-DD"; openedOn is null until the letter is opened.
     (Always wrapped in try/catch: blocked storage must never break a page.)
     ------------------------------------------------------------------- */
  function isValidLetter(l) {
    return l && typeof l.id === 'string' && typeof l.text === 'string' && l.text.trim() !== '' &&
      DAY_DATE.test(l.writtenOn) && DAY_DATE.test(l.opensOn) &&
      (l.openedOn == null || DAY_DATE.test(l.openedOn));
  }

  function load() {
    try {
      const list = JSON.parse(localStorage.getItem(LETTERS_KEY));
      return Array.isArray(list) ? list.filter(isValidLetter) : [];
    } catch (err) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(LETTERS_KEY, JSON.stringify(list));
      return true;
    } catch (err) {
      return false;
    }
  }

  // Has its day come? (date strings compare correctly as text)
  function hasArrived(letter) {
    return letter.opensOn <= todayKey();
  }

  // Arrived but not opened yet, oldest first
  function readyToOpen(list) {
    return (list || load())
      .filter((l) => !l.openedOn && hasArrived(l))
      .sort((a, b) => a.opensOn.localeCompare(b.opensOn));
  }

  function markOpened(id) {
    const list = load();
    const letter = list.find((l) => l.id === id);
    if (letter && !letter.openedOn) {
      letter.openedOn = todayKey();
      save(list);
    }
  }


  /* -------------------------------------------------------------------
     Dates
     ------------------------------------------------------------------- */
  function dateFromKey(key) {
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  // "23 October", plus the year if it isn't this year
  function formatDay(key) {
    const date = dateFromKey(key);
    const options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
    return date.toLocaleDateString('en-GB', options);
  }

  // Today plus a "WHEN" choice. Months keep the same day of the month;
  // if that day doesn't exist (31 January + 1 month), it's the month's last day.
  function opensOnFor(choice) {
    const when = WHEN[choice] || WHEN['1m'];
    const now = new Date();
    if (when.days) {
      return todayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + when.days));
    }
    const target = new Date(now.getFullYear(), now.getMonth() + when.months, now.getDate());
    if (target.getDate() !== now.getDate()) target.setDate(0); // rolled over: back to the last day
    return todayKey(target);
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }


  /* -------------------------------------------------------------------
     The envelope: back, front pocket, flap, and a wax seal in the
     accent color. Options: sealed (show the seal), open (flap up),
     glowing (a letter that has arrived).
     ------------------------------------------------------------------- */
  function createEnvelope(options) {
    const opts = options || {};
    const envelope = document.createElement('span');
    envelope.className = 'envelope' +
      (opts.sealed ? ' is-sealed' : '') +
      (opts.open ? ' is-open' : '') +
      (opts.glowing ? ' is-glowing' : '');
    envelope.setAttribute('aria-hidden', 'true');
    envelope.innerHTML =
      '<span class="envelope__back"></span>' +
      '<span class="envelope__pocket"></span>' +
      '<span class="envelope__flap"></span>' +
      '<span class="envelope__seal">' +
        '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 4.5l2 4.6 5 .5-3.8 3.3 1.1 4.9L12 15.3l-4.3 2.5 1.1-4.9L5 9.6l5-.5z"/></svg>' +
      '</span>';
    return envelope;
  }


  /* -------------------------------------------------------------------
     Opening a letter: the envelope unseals, opens, and the letter rises
     out, over a softly blurred page. A native <dialog> (focus stays
     inside, Esc closes); tapping outside the letter closes it too.
     ------------------------------------------------------------------- */
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function openLetter(letter, onClose) {
    markOpened(letter.id);

    const dialog = document.createElement('dialog');
    dialog.className = 'letter-open';
    dialog.setAttribute('aria-label', 'A letter from ' + formatDay(letter.writtenOn));

    const stage = document.createElement('div');
    stage.className = 'letter-open__stage';
    const envelope = createEnvelope({ sealed: true });

    const paper = document.createElement('article');
    paper.className = 'letter-paper letter-open__paper';
    paper.tabIndex = -1;
    const written = document.createElement('p');
    written.className = 'letter-paper__date';
    written.textContent = 'Written on ' + formatDay(letter.writtenOn);
    const hello = document.createElement('p');
    hello.className = 'letter-paper__hello';
    hello.textContent = 'Dear future me,';
    const body = document.createElement('p');
    body.className = 'letter-paper__body';
    body.textContent = letter.text;
    const sign = document.createElement('p');
    sign.className = 'letter-paper__sign';
    sign.textContent = '— Me, on ' + formatDay(letter.writtenOn);
    const actions = document.createElement('div');
    actions.className = 'letter-paper__actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn btn--link';
    close.textContent = 'Close';
    actions.appendChild(close);
    paper.append(written, hello, body, sign, actions);

    stage.append(envelope, paper);
    dialog.appendChild(stage);
    document.body.appendChild(dialog);

    let closed = false;
    async function finish() {
      if (closed) return;
      closed = true;
      if (!reducedMotion.matches) {
        dialog.classList.add('is-closing');
        await wait(200);
      }
      dialog.close();
      dialog.remove();
      if (onClose) onClose();
    }
    close.addEventListener('click', finish);
    dialog.addEventListener('click', (event) => { if (event.target === dialog) finish(); });
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(); });

    dialog.showModal();

    if (reducedMotion.matches) {
      dialog.classList.add('is-reading');
      paper.focus();
      return;
    }
    // The seal breaks, the flap lifts, the letter rises out
    stage.tabIndex = -1;
    stage.focus({ preventScroll: true });
    (async () => {
      await wait(550);
      if (closed) return;
      dialog.classList.add('is-unsealing');
      haptic();
      await wait(420);
      envelope.classList.add('is-open');
      await wait(560);
      if (closed) return;
      dialog.classList.add('is-reading');
      paper.focus({ preventScroll: true });
    })();
  }


  /* -------------------------------------------------------------------
     Today page: "A letter from past you has arrived."
     ------------------------------------------------------------------- */
  function mountArrivalCard(spot) {
    const ready = readyToOpen();
    spot.hidden = ready.length === 0;
    if (!ready.length) {
      spot.replaceChildren();
      return;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card letter-arrived__button';
    const text = document.createElement('span');
    text.className = 'letter-arrived__text';
    const title = document.createElement('span');
    title.className = 'letter-arrived__title';
    title.textContent = ready.length === 1
      ? 'A letter from past you has arrived.'
      : ready.length + ' letters from past you have arrived.';
    const hint = document.createElement('span');
    hint.className = 'letter-arrived__hint';
    hint.textContent = 'Tap to open it.';
    text.append(title, hint);
    button.append(createEnvelope({ sealed: true, glowing: true }), text);
    // The oldest one first; afterwards the card shows the next, or goes away
    button.addEventListener('click', () => openLetter(ready[0], () => mountArrivalCard(spot)));
    spot.replaceChildren(button);
  }


  /* -------------------------------------------------------------------
     Me page: a one-line summary on the "Letters to future me" card
     ------------------------------------------------------------------- */
  function mountSummary(spot) {
    const list = load();
    const ready = readyToOpen(list).length;
    const waiting = list.filter((l) => !l.openedOn && !hasArrived(l))
      .sort((a, b) => a.opensOn.localeCompare(b.opensOn));
    const opened = list.filter((l) => l.openedOn).length;

    let text;
    if (ready) {
      text = ready === 1 ? 'A letter is ready to open.' : ready + ' letters are ready to open.';
    } else if (waiting.length) {
      text = waiting.length + ' waiting · the next opens on ' + formatDay(waiting[0].opensOn);
    } else if (opened) {
      text = opened + (opened === 1 ? ' letter' : ' letters') + ' opened. Write another?';
    } else {
      text = 'Write a letter to open later.';
    }
    spot.textContent = text;

    const icon = document.querySelector('[data-letters-icon]');
    if (icon) icon.replaceChildren(createEnvelope({ sealed: true, glowing: ready > 0 }));
  }


  document.addEventListener('DOMContentLoaded', () => {
    const arrived = document.getElementById('letter-arrived');
    if (arrived) mountArrivalCard(arrived);
    const summary = document.getElementById('letters-summary');
    if (summary) mountSummary(summary);
  });


  window.LittleSunshineLetters = {
    MAX_TEXT: MAX_TEXT,
    load: load,
    save: save,
    hasArrived: hasArrived,
    readyToOpen: readyToOpen,
    formatDay: formatDay,
    opensOnFor: opensOnFor,
    newId: newId,
    createEnvelope: createEnvelope,
    openLetter: openLetter,
  };
})();
