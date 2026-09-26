/* =====================================================================
   Little Sunshine: letters.js (the "Letters to future me" page)
   Write a letter, choose when it may be opened, and seal it: the paper
   folds into an envelope, a wax seal stamps onto it, and it slides into
   "Waiting". Letters can't be read before their day. Arrived letters
   open with a small animation and are kept under "Opened".
   Storage, dates, the envelope, and opening a letter live in
   letters-shared.js (window.LittleSunshineLetters); the profile, sky,
   toast, and bottom navigation in shared.js (window.LittleSunshine).

   Loaded in <head> without defer, after shared.js and letters-shared.js.
   The top part runs right away (apply the sky before first paint); the
   rest waits for DOMContentLoaded.
   ===================================================================== */
(function () {
  'use strict';

  const { loadProfile, applySky, showToast, renderBottomNav, todayKey, haptic } = window.LittleSunshine;
  const Letters = window.LittleSunshineLetters;

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Resolves once scrolling has settled (or after a short wait)
  function afterScroll() {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      window.addEventListener('scrollend', finish, { once: true });
      setTimeout(finish, 700);
    });
  }


  /* -------------------------------------------------------------------
     Run immediately (shared.js has already sent visitors with no
     profile back to the welcome page)
     ------------------------------------------------------------------- */
  const profile = loadProfile();
  if (!profile) return;

  applySky(profile.sky);
  root.style.setProperty('--sun-rise', '1'); // sun high in the sky


  /* -------------------------------------------------------------------
     Everything below needs the page's elements
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function init() {
    const $ = (id) => document.getElementById(id);
    const els = {
      form: $('letter-form'),
      paper: $('letter-paper'),
      input: $('letter-input'),
      hint: $('letter-hint'),
      count: $('letter-count'),
      when: $('letter-when'),
      whenDate: $('letter-when-date'),
      seal: $('letter-seal'),
      readySection: $('ready-section'),
      readyList: $('ready-list'),
      waitingList: $('waiting-list'),
      waitingEmpty: $('waiting-empty'),
      openedList: $('opened-list'),
      openedEmpty: $('opened-empty'),
    };

    let busy = false; // a letter is being sealed


    /* ---------------- Writing ---------------- */
    function chosenWhen() {
      const checked = els.when.querySelector('input:checked');
      return checked ? checked.value : '1m';
    }

    function updateCount() {
      els.count.textContent = els.input.value.length + ' / ' + Letters.MAX_TEXT;
    }

    function updateWhenDate() {
      els.whenDate.textContent = 'It will open on ' + Letters.formatDay(Letters.opensOnFor(chosenWhen())) + '.';
    }

    function setHint(message) {
      els.hint.textContent = message;
      if (message) els.input.setAttribute('aria-invalid', 'true');
      else els.input.removeAttribute('aria-invalid');
    }


    /* ---------------- The lists ---------------- */
    function textBlock(title, detail) {
      const text = document.createElement('span');
      text.className = 'letter-item__text';
      const t = document.createElement('span');
      t.className = 'letter-item__title';
      t.textContent = title;
      const d = document.createElement('span');
      d.className = 'letter-item__detail';
      d.textContent = detail;
      text.append(t, d);
      return text;
    }

    // Arrived: a glowing envelope you can open
    function createReadyItem(letter) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'letter-item letter-item--ready';
      button.append(
        Letters.createEnvelope({ sealed: true, glowing: true }),
        textBlock('It has arrived. Tap to open.', 'Written on ' + Letters.formatDay(letter.writtenOn))
      );
      button.addEventListener('click', () => Letters.openLetter(letter, renderLists));
      item.appendChild(button);
      return item;
    }

    // Waiting: just the envelope and its date. No way to open it early.
    function createWaitingItem(letter) {
      const item = document.createElement('li');
      item.className = 'letter-item';
      item.dataset.id = letter.id;
      item.append(
        Letters.createEnvelope({ sealed: true }),
        textBlock('Opens on ' + Letters.formatDay(letter.opensOn), 'Written on ' + Letters.formatDay(letter.writtenOn))
      );
      return item;
    }

    // Opened: the letter itself, on paper
    function createOpenedItem(letter) {
      const item = document.createElement('li');
      item.className = 'letter-paper opened-letter';
      const date = document.createElement('p');
      date.className = 'letter-paper__date';
      date.textContent = 'Written on ' + Letters.formatDay(letter.writtenOn) +
        ' · opened on ' + Letters.formatDay(letter.openedOn);
      const hello = document.createElement('p');
      hello.className = 'letter-paper__hello';
      hello.textContent = 'Dear future me,';
      const body = document.createElement('p');
      body.className = 'letter-paper__body';
      body.textContent = letter.text;
      item.append(date, hello, body);
      return item;
    }

    // `arrivingId`: a just-sealed letter, kept invisible until its envelope lands
    function renderLists(arrivingId) {
      const all = Letters.load();
      const ready = Letters.readyToOpen(all);
      const waiting = all.filter((l) => !l.openedOn && !Letters.hasArrived(l))
        .sort((a, b) => a.opensOn.localeCompare(b.opensOn) || a.writtenOn.localeCompare(b.writtenOn));
      const opened = all.filter((l) => l.openedOn)
        .sort((a, b) => b.openedOn.localeCompare(a.openedOn));

      els.readySection.hidden = ready.length === 0;
      els.readyList.replaceChildren(...ready.map(createReadyItem));

      els.waitingList.replaceChildren(...waiting.map(createWaitingItem));
      els.waitingEmpty.hidden = waiting.length > 0;
      els.waitingList.hidden = waiting.length === 0;

      els.openedList.replaceChildren(...opened.map(createOpenedItem));
      els.openedEmpty.hidden = opened.length > 0;
      els.openedList.hidden = opened.length === 0;

      if (typeof arrivingId === 'string') {
        const item = els.waitingList.querySelector(`[data-id="${arrivingId}"]`);
        if (item) item.classList.add('is-arriving');
        return item;
      }
      return null;
    }


    /* ---------------- Sealing: fold, stamp, slide ---------------- */
    async function sealAnimation(letterId) {
      const paperBox = els.paper.getBoundingClientRect();
      const envWidth = Math.min(260, paperBox.width * 0.8);
      const envHeight = envWidth * 5 / 8;
      const centerX = paperBox.left + paperBox.width / 2;
      const centerY = paperBox.top + Math.min(paperBox.height, window.innerHeight) / 2;

      // The flying piece: a sheet of paper and an (open) envelope, stacked
      const fly = document.createElement('div');
      fly.className = 'seal-fly';
      fly.setAttribute('aria-hidden', 'true');
      fly.style.left = (centerX - envWidth / 2) + 'px';
      fly.style.top = (centerY - envHeight / 2) + 'px';
      fly.style.width = envWidth + 'px';
      fly.style.height = envHeight + 'px';
      const sheet = document.createElement('div');
      sheet.className = 'seal-fly__sheet';
      const envelope = Letters.createEnvelope({ open: true });
      envelope.classList.add('seal-fly__envelope');
      fly.append(envelope, sheet);
      document.body.appendChild(fly);

      const flap = envelope.querySelector('.envelope__flap');
      const seal = envelope.querySelector('.envelope__seal');

      // 1. The paper folds down to envelope size
      const sx = paperBox.width / envWidth;
      const sy = paperBox.height / envHeight;
      await sheet.animate([
        { transform: `scale(${sx}, ${sy})` },
        { transform: `scale(${sx * 0.92}, ${sy * 0.5}) rotateX(50deg)`, offset: 0.45 },
        { transform: 'scale(0.96, 0.9)', opacity: 1, offset: 0.85 },
        { transform: 'scale(0.9, 0.8)', opacity: 0 },
      ], { duration: 720, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' }).finished;

      // 2. The flap closes
      envelope.classList.remove('is-open');
      await flap.animate([
        { transform: 'rotateX(180deg)' },
        { transform: 'rotateX(0deg)' },
      ], { duration: 420, easing: 'ease-in-out' }).finished;

      // 3. The wax seal stamps on, with a small bounce
      envelope.classList.add('is-sealed');
      setTimeout(haptic, 260);
      await seal.animate([
        { transform: 'translate(-50%, -50%) scale(2.2)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(0.86)', opacity: 1, offset: 0.6 },
        { transform: 'translate(-50%, -50%) scale(1.08)', offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ], { duration: 480, easing: 'ease-out' }).finished;
      await wait(260);

      // 4. It slides into the "Waiting" list
      const item = renderLists(letterId);
      const target = item && item.querySelector('.envelope');
      if (target) {
        let box = target.getBoundingClientRect();
        if (box.top < 60 || box.bottom > window.innerHeight - 90) {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          await afterScroll();
          box = target.getBoundingClientRect();
        }
        const from = fly.getBoundingClientRect();
        await fly.animate([
          { transform: 'translate(0, 0) scale(1)' },
          { transform: `translate(${box.left - from.left}px, ${box.top - from.top}px) scale(${box.width / from.width})` },
        ], { duration: 700, easing: 'cubic-bezier(0.5, 0, 0.2, 1)', fill: 'forwards' }).finished;
        item.classList.remove('is-arriving');
        item.classList.add('is-landed');
      }
      fly.remove();
    }

    async function sealLetter(event) {
      event.preventDefault();
      if (busy) return;
      const text = els.input.value.trim().slice(0, Letters.MAX_TEXT);
      if (!text) {
        setHint('Write a few words first.');
        els.input.focus();
        return;
      }

      const letter = {
        id: Letters.newId(),
        text: text,
        writtenOn: todayKey(),
        opensOn: Letters.opensOnFor(chosenWhen()),
        openedOn: null,
      };
      const list = Letters.load();
      list.push(letter);
      if (!Letters.save(list)) {
        showToast("I couldn't save that on this device, sorry.");
        return;
      }

      busy = true;
      els.seal.disabled = true;
      setHint('');
      els.input.blur(); // closes the phone keyboard

      if (reducedMotion.matches) {
        els.input.value = '';
        updateCount();
        renderLists();
      } else {
        const sealing = sealAnimation(letter.id);
        // The words leave the page as the paper folds away
        requestAnimationFrame(() => { els.input.value = ''; updateCount(); });
        await sealing;
      }

      showToast('Sealed. It opens on ' + Letters.formatDay(letter.opensOn) + '.');
      els.seal.disabled = false;
      busy = false;
    }


    /* ---------------- Start ---------------- */
    renderBottomNav('me');
    updateCount();
    updateWhenDate();
    renderLists();

    els.form.addEventListener('submit', sealLetter);
    els.input.addEventListener('input', () => {
      updateCount();
      if (els.input.value.trim()) setHint('');
    });
    els.when.addEventListener('change', updateWhenDate);
  });
})();
