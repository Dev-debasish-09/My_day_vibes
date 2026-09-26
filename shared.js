/* =====================================================================
   Little Sunshine: shared.js
   The bits every page needs: the saved profile, sky themes, the toast,
   and the bottom navigation. Exposed as window.LittleSunshine.

   Load it in <head> without defer, before the page's own script. The
   top part runs right away: on every page except the welcome page
   (index.html), no saved name means go back to the welcome page.
   ===================================================================== */
(function () {
  'use strict';

  /* -------------------------------------------------------------------
     Settings
     ------------------------------------------------------------------- */
  const PROFILE_KEY = 'littleSunshine:profile';
  const LEGACY_PROFILE_KEY = 'littleSunshine:v1'; // before shared.js; moved over on first read
  const MAX_NAME = 24;

  // Order here = order of the sky tiles on the welcome page.
  // statusBar is used for <meta name="theme-color"> (it's the sky's top color).
  const SKIES = {
    peach:    { label: 'Peach sunrise', statusBar: '#FFD8BE' },
    lavender: { label: 'Lavender dusk', statusBar: '#D9CCF5' },
    sea:      { label: 'Sea breeze',    statusBar: '#CDE7F5' },
    mint:     { label: 'Mint garden',   statusBar: '#CFE3D4' },
  };

  // Bottom navigation, left to right
  const TABS = [
    {
      key: 'today',
      label: 'Today',
      href: 'home.html',
      icon: '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M5.6 18.4l1.1-1.1M17.3 6.7l1.1-1.1"/>',
    },
    {
      key: 'joy',
      label: 'Joy Jar',
      href: 'joy.html',
      icon: '<path d="M8 3.5h8M9 3.5v3c-2.4 1-4 3.3-4 6.2V17a3.5 3.5 0 0 0 3.5 3.5h7A3.5 3.5 0 0 0 19 17v-4.3c0-2.9-1.6-5.2-4-6.2v-3"/>' +
        '<path d="M12 16.2c-1.6-1-2.6-2-2.6-3.1a1.3 1.3 0 0 1 2.6-.4 1.3 1.3 0 0 1 2.6.4c0 1.1-1 2.1-2.6 3.1z"/>',
    },
    {
      key: 'breathe',
      label: 'Breathe',
      href: 'breathe.html',
      icon: '<path d="M3.5 9h11a2.5 2.5 0 1 0-2.5-2.5"/>' +
        '<path d="M3.5 13h14a2.5 2.5 0 1 1-2.5 2.5"/>' +
        '<path d="M3.5 17h6"/>',
    },
    {
      key: 'me',
      label: 'Me',
      href: 'me.html',
      icon: '<circle cx="12" cy="8.5" r="3.8"/>' +
        '<path d="M4.5 20c.8-3.6 3.8-5.8 7.5-5.8s6.7 2.2 7.5 5.8"/>',
    },
  ];

  const root = document.documentElement;


  /* -------------------------------------------------------------------
     Small helpers
     ------------------------------------------------------------------- */
  // Collapse inner spaces, trim, and cap the length
  function cleanName(value) {
    return String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  }

  // Local date as "YYYY-MM-DD"
  function todayKey(date) {
    const d = date || new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }


  /* -------------------------------------------------------------------
     Profile storage: { name, sky, joinedDate }
     (always wrapped in try/catch: private mode, blocked storage, or a
     full quota must never break the page)
     ------------------------------------------------------------------- */
  function readStoredProfile() {
    try {
      const saved = localStorage.getItem(PROFILE_KEY);
      if (saved !== null) return JSON.parse(saved);

      // One-time move from the old key, so nobody has to set up again
      const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
      if (legacy === null) return null;
      localStorage.setItem(PROFILE_KEY, legacy);
      localStorage.removeItem(LEGACY_PROFILE_KEY);
      return JSON.parse(legacy);
    } catch (err) {
      return null;
    }
  }

  // Returns the saved profile, or null if there's no usable name
  function loadProfile() {
    const data = readStoredProfile();
    if (!data || typeof data.name !== 'string') return null;
    const name = cleanName(data.name);
    if (!name) return null;
    return {
      name: name,
      sky: SKIES[data.sky] ? data.sky : 'peach',
      joinedDate: /^\d{4}-\d{2}-\d{2}$/.test(data.joinedDate) ? data.joinedDate : todayKey(),
    };
  }

  // Returns true if it was saved
  function saveProfile(profile) {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        name: profile.name,
        sky: profile.sky,
        joinedDate: profile.joinedDate,
      }));
      return true;
    } catch (err) {
      return false; // storage unavailable: the page still works, it just won't remember
    }
  }


  /* -------------------------------------------------------------------
     Sky theme. The themes live on <html> (not <body>), so this works
     from <head> before the body exists, and the page background and
     overscroll color match too.
     ------------------------------------------------------------------- */
  function applySky(key) {
    const sky = SKIES[key] ? key : 'peach';
    root.setAttribute('data-sky', sky);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', SKIES[sky].statusBar);
  }


  /* -------------------------------------------------------------------
     Toast: one per page, added to <body> once the page has loaded.
     role=status announces it politely.
     ------------------------------------------------------------------- */
  let toastTimer = 0;

  function getToast() {
    let toast = document.getElementById('toast');
    if (!toast && document.body) {
      toast = document.createElement('div');
      toast.className = 'toast';
      toast.id = 'toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    return toast;
  }

  function showToast(message) {
    const toast = getToast();
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 3200);
  }


  /* -------------------------------------------------------------------
     Bottom navigation. `activeTab` is "today", "joy", "breathe" or "me".
     Added at the end of <body>, just before the toast.
     ------------------------------------------------------------------- */
  function renderBottomNav(activeTab) {
    const nav = document.createElement('nav');
    nav.className = 'tabbar';
    nav.setAttribute('aria-label', 'Main');

    const inner = document.createElement('div');
    inner.className = 'tabbar__inner';

    TABS.forEach((tab) => {
      const link = document.createElement('a');
      link.className = 'tab';
      link.href = tab.href;
      if (tab.key === activeTab) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
      link.innerHTML =
        '<svg class="tab__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + tab.icon + '</svg>' +
        '<span class="tab__label"></span>';
      link.querySelector('.tab__label').textContent = tab.label;
      inner.appendChild(link);
    });

    nav.appendChild(inner);
    document.body.insertBefore(nav, getToast());
    return nav;
  }


  /* -------------------------------------------------------------------
     Run immediately: no saved name means go back to the welcome page
     ------------------------------------------------------------------- */
  const isWelcomePage = /(^|\/)(index(\.html)?)?$/.test(window.location.pathname);
  if (!isWelcomePage && !loadProfile()) {
    window.location.replace('./');
  }

  // Make sure the toast exists before anything is announced in it
  document.addEventListener('DOMContentLoaded', getToast);


  window.LittleSunshine = {
    SKIES: SKIES,
    MAX_NAME: MAX_NAME,
    cleanName: cleanName,
    todayKey: todayKey,
    loadProfile: loadProfile,
    saveProfile: saveProfile,
    applySky: applySky,
    showToast: showToast,
    renderBottomNav: renderBottomNav,
  };
})();
