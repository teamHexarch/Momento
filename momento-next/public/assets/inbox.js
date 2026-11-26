// Notifications inbox: a bell next to the account chip, with a count of unread notifications, that
// opens a small panel listing them. Loaded on every page with an account chip ([data-acct-host]).
//
// The API (the Momento server, or assets/devpreview.js in the local preview):
//   GET  /api/notifications       -> { notifications: [{ id, type, title, body?, url?, albumId?, groupId?, photoIds?, at, read, actor?: { name, avatarUrl } }], unread }
//   Tapping one goes to its url, or else (see linkOf): new photos (type photos + photoIds) open the album showing just
//   those; a join request (type request) opens the album settings at "Waiting for you" to approve or decline; anything
//   else with an albumId opens the album, a groupId the group, and an invite Social's "Needs you".
//   POST /api/notifications/read  { ids: [...] } marks those read; {} marks every one read -> { unread }
// It's checked when the page opens, every minute while the tab is in view, and when you come back to the tab.
// A server without /api/notifications (404) gets no bell at all, rather than a bell that always errors.
(function () {
  const M = (window.Momento ||= {});
  const POLL_MS = 60000;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (inner, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const BELL = '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z"/><path d="M10 20a2 2 0 0 0 4 0"/>';
  const ICON = {
    bell: svg(BELL, 19),
    photos: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>', 16),
    joined: svg('<circle cx="10" cy="8.5" r="3.2"/><path d="M4 19.5c.6-3.2 2.9-5 6-5s5.4 1.8 6 5M18 8v6M15 11h6"/>', 16),
    invite: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>', 16),
    closing: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 16),
    other: svg(BELL, 16),
  };
  // The same pictures, small, for the badge on each notification's avatar
  const KIND = {
    photos: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m21 16-5-5-8 8"/>', 11),
    request: svg('<circle cx="10" cy="8.5" r="3.2"/><path d="M4 19.5c.6-3.2 2.9-5 6-5s5.4 1.8 6 5M18 8v6M15 11h6"/>', 11),
    joined: svg('<circle cx="10" cy="8.5" r="3.2"/><path d="M4 19.5c.6-3.2 2.9-5 6-5s5.4 1.8 6 5"/>', 11),
    invite: svg('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>', 11),
    closing: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', 11),
    other: svg(BELL, 11),
  };
  // Kinds that ask something of you. While unread they sit at the top under "Needs you", with a button
  // to deal with them right there; once seen or answered they join the rest
  const URGENT = new Set(['request', 'invite', 'closing']);
  const isUrgent = (n) => URGENT.has(n.type) && !n.read;
  const EARLIER_SHOWN = 8;   // not-urgent ones listed before "Show older"
  const UNDO_MS = 6000;      // how long "Clear all" can be undone before it's sent to the server

  const css = document.createElement('style');
  css.textContent = `
    [data-acct-host].has-inbox:not([hidden]) { display: flex; align-items: center; justify-content: flex-end; gap: .5rem; }
    .inbox { position: relative; flex: none; }
    .inbox-btn {
      --radius: 100px; position: relative; display: grid; place-items: center; width: 2.7rem; height: 2.7rem; padding: 0;
      border-radius: 50%; color: var(--dusk); cursor: pointer; transition: scale .3s var(--spring);
    }
    @media (hover: hover) { .inbox-btn:hover { scale: 1.06; } }
    .inbox-btn:active { scale: .95; }
    .inbox-btn:focus-visible { outline: 2px solid var(--dusk); outline-offset: 2px; }
    .inbox-btn svg { transform-origin: 50% 12%; }
    .inbox-btn.is-ringing svg { animation: inbox-ring .9s var(--out) 1; }
    @keyframes inbox-ring { 0% { rotate: 0deg; } 15% { rotate: 16deg; } 35% { rotate: -12deg; } 55% { rotate: 7deg; } 75% { rotate: -3deg; } 100% { rotate: 0deg; } }
    .inbox-pip {
      position: absolute; top: .1rem; right: .05rem; min-width: 1.2rem; height: 1.2rem; padding: 0 .28rem; box-sizing: border-box; border-radius: 100px;
      background: var(--pick, #8A5232); color: #fff; font: 700 .72rem/1.2rem var(--font-main, system-ui); text-align: center; font-variant-numeric: tabular-nums;
      box-shadow: 0 0 0 2px var(--paper, #F8F7FA); pointer-events: none;
    }
    .inbox-pip[hidden] { display: none; }
    :root[data-theme="dark"] .inbox-pip { background: var(--pick, #6C5FC7); box-shadow: 0 0 0 2px #1C1A26; }

    .inbox-pop {
      position: absolute; top: calc(100% + .6rem); right: 0; z-index: 6; display: flex; flex-direction: column; box-sizing: border-box;
      width: 24rem; max-height: min(34rem, 75dvh); overflow: hidden; color: var(--dusk); text-align: left; white-space: normal; outline: none;
      transform-origin: calc(100% - 1.35rem) top; opacity: 0; transform: translateY(-8px) scale(.94); pointer-events: none; visibility: hidden;
      transition: opacity .25s ease, transform .5s var(--spring), visibility 0s .5s;
    }
    /* Fully solid (menus elsewhere let a trace of the page through, which muddies a list this long) */
    .inbox-pop.inbox-pop { background: linear-gradient(180deg, #fff, #F9F8FC) padding-box, var(--g-rim-menu) border-box; }
    :root[data-theme="dark"] .inbox-pop.inbox-pop { background: linear-gradient(180deg, #24212F, #181622) padding-box, var(--g-rim-menu) border-box; }
    .inbox-pop.is-open { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition: opacity .25s ease, transform .5s var(--spring); }
    .inbox-head {
      flex: none; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .3rem .75rem; padding: 1rem 1rem .8rem 1.2rem;
      box-shadow: inset 0 -1px 0 rgba(46,44,58,.07);
    }
    /* The summary keeps at least 10rem; a long "Mark all read" in another language moves under it instead of squeezing it */
    .inbox-head > div { flex: 1 1 10rem; min-width: 0; }
    .inbox-head h2 { margin: 0; font-size: 1.02rem; font-weight: 700; letter-spacing: -.015em; line-height: 1.3; }
    .inbox-sum { margin: .1rem 0 0; color: var(--slate); font-size: .8rem; line-height: 1.4; }
    .inbox-sum b { color: var(--pick, #8A5232); font-weight: 650; }
    .inbox-link {
      flex: none; margin: -.3rem 0; padding: .4rem .7rem; border: 0; border-radius: 100px; background: none; color: var(--slate);
      font: 650 .82rem var(--font-main, system-ui); cursor: pointer; transition: background-color .2s ease, color .2s ease, transform .3s var(--spring);
    }
    .inbox-link:hover { background: rgba(46,44,58,.07); color: var(--dusk); }
    .inbox-link:active { transform: scale(.95); }
    .inbox-link:focus-visible { outline: 2px solid var(--dusk); outline-offset: 2px; }
    .inbox-link:disabled { opacity: .4; pointer-events: none; }
    /* (white-space is reset above: some headers, like the home page's, keep their contents on one line) */
    /* The list comes in two groups, most pressing first:
         Urgent      join requests, invites and albums about to close that you haven't seen: each with its button
         Not urgent  everything else, newest first; unread ones in full, seen ones quieter and a line shorter,
                     the oldest folded behind "Show older"
       "Clear all" sits at the foot of the panel, with a few seconds to undo it */
    .inbox-foot { flex: none; display: flex; justify-content: center; padding: .45rem 1rem .55rem; box-shadow: inset 0 1px 0 rgba(46,44,58,.07); }
    .inbox-foot[hidden] { display: none; }
    .inbox-foot .inbox-link { margin: 0; }
    :root[data-theme="dark"] .inbox-foot { box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
    .inbox-list { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; margin: 0; padding: .35rem .45rem .55rem; list-style: none; }
    .inbox-list li { min-width: 0; }
    .inbox-group + .inbox-group { margin-top: .45rem; }
    .inbox-sec { display: flex; align-items: center; gap: .45rem; margin: 0; padding: .6rem .8rem .35rem; color: var(--slate); font-size: .78rem; font-weight: 650; letter-spacing: 0; }
    .inbox-sec span {
      min-width: 1.1rem; height: 1.1rem; padding: 0 .3rem; box-sizing: border-box; border-radius: 100px; background: rgba(46,44,58,.08);
      color: var(--dusk); font-size: .68rem; line-height: 1.1rem; text-align: center; font-variant-numeric: tabular-nums;
    }
    .inbox-group.is-needs { padding-bottom: .25rem; border-radius: 16px; background: color-mix(in srgb, var(--pick, #8A5232) 7%, transparent); }
    .inbox-group.is-needs .inbox-sec { color: var(--pick, #8A5232); }
    .inbox-group.is-needs .inbox-sec span { background: var(--pick, #8A5232); color: #fff; }
    .inbox-sub { display: grid; gap: .1rem; margin: 0; padding: 0; list-style: none; }

    .inbox-item {
      position: relative; display: grid; grid-template-columns: 2.25rem minmax(0, 1fr) auto; align-items: start; gap: .75rem; width: 100%; box-sizing: border-box;
      padding: .6rem .7rem; border: 0; border-radius: 12px; background: none; color: inherit; font: inherit; text-align: left; text-decoration: none; cursor: pointer;
      transition: background-color .2s ease;
    }
    .inbox-item:hover { background: rgba(46,44,58,.06); }
    .inbox-item:active { background: rgba(46,44,58,.1); }
    .inbox-item:focus-visible { outline: 2px solid var(--dusk); outline-offset: -2px; }
    .inbox-av {
      position: relative; display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 50%;
      background: linear-gradient(135deg, #C9C0E2, #E6CDD6 55%, #A9CCC8); color: #2E2C3A; font: 700 .84rem var(--font-main, system-ui);
    }
    .inbox-av img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    /* What kind of news it is, as a small badge on the picture */
    .inbox-kind {
      position: absolute; right: -.2rem; bottom: -.2rem; display: grid; place-items: center; width: 1.1rem; height: 1.1rem; border-radius: 50%;
      background: var(--paper, #F8F7FA); color: var(--dusk); box-shadow: 0 0 0 1.5px var(--paper, #F8F7FA), 0 1px 3px rgba(46,44,58,.25);
    }
    .is-needs .inbox-kind { background: var(--pick, #8A5232); color: #fff; }
    .inbox-text { display: grid; grid-template-columns: minmax(0, 1fr); gap: .1rem; min-width: 0; }
    .inbox-title { min-width: 0; color: var(--dusk); font-size: .875rem; font-weight: 600; line-height: 1.4; overflow-wrap: break-word; }
    .inbox-body {
      display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
      color: var(--slate); font-size: .8rem; line-height: 1.45; overflow-wrap: break-word;
    }
    .inbox-body.is-done { color: var(--dusk); font-weight: 600; }
    .inbox-body.is-error { color: var(--danger-ink, #9A3D3D); }
    .inbox-row.is-seen .inbox-title { font-weight: 500; color: var(--slate); }
    .inbox-row.is-seen .inbox-body:not(.is-done, .is-error) { -webkit-line-clamp: 1; color: var(--stone); }
    .inbox-row.is-seen .inbox-av { opacity: .85; }
    .inbox-meta { display: flex; flex-direction: column; align-items: flex-end; gap: .45rem; padding-top: .15rem; }
    .inbox-time { color: var(--stone); font-size: .72rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .inbox-dot { width: .5rem; height: .5rem; border-radius: 50%; background: var(--pick, #8A5232); }
    /* A pressing one's buttons, lined up under its text */
    .inbox-acts { display: flex; flex-wrap: wrap; gap: .4rem; padding: 0 .7rem .55rem 3.7rem; margin-top: -.15rem; }
    .inbox-acts .inbox-act {
      min-height: 2.1rem; padding: 0 .95rem; border-radius: 100px; font: 650 .8rem var(--font-main, system-ui); cursor: pointer;
      transition: scale .3s var(--spring), opacity .2s ease;
    }
    .inbox-acts .inbox-act:active { scale: .95; }
    .inbox-acts .inbox-act:focus-visible { outline: 2px solid var(--dusk); outline-offset: 2px; }
    .inbox-acts .inbox-act:disabled { opacity: .5; cursor: progress; }
    .inbox-more {
      display: block; width: calc(100% - 1rem); margin: .3rem auto 0; padding: .55rem; border: 0; border-radius: 10px; background: none;
      color: var(--slate); font: 650 .8rem var(--font-main, system-ui); cursor: pointer; transition: background-color .2s ease, color .2s ease;
    }
    .inbox-more:hover { background: rgba(46,44,58,.06); color: var(--dusk); }
    .inbox-more:active { background: rgba(46,44,58,.1); }
    .inbox-more:focus-visible { outline: 2px solid var(--dusk); outline-offset: -2px; }
    .inbox-note { margin: 0; padding: 1.8rem 1.4rem 2rem; color: var(--slate); font-size: .86rem; line-height: 1.6; text-align: center; }
    .inbox-note b { display: block; margin-bottom: .2rem; color: var(--dusk); font-size: .95rem; }
    .inbox-note .inbox-link { margin-top: .6rem; }
    :root[data-theme="dark"] .inbox-head { box-shadow: inset 0 -1px 0 rgba(255,255,255,.08); }
    :root[data-theme="dark"] :is(.inbox-link, .inbox-item, .inbox-more):hover { background: rgba(255,255,255,.08); }
    :root[data-theme="dark"] .inbox-group.is-needs { background: rgba(184,174,245,.09); }
    :root[data-theme="dark"] :is(.inbox-group.is-needs .inbox-sec, .inbox-sum b) { color: #C9C1FA; }
    :root[data-theme="dark"] .inbox-group.is-needs .inbox-sec span, :root[data-theme="dark"] .is-needs .inbox-kind { background: #B8AEF5; color: #1C1A26; }
    :root[data-theme="dark"] .inbox-sec span { background: rgba(255,255,255,.1); }
    :root[data-theme="dark"] .inbox-kind { background: #2A2836; color: #E8E6F0; box-shadow: 0 0 0 1.5px #1C1A26; }
    :root[data-theme="dark"] .inbox-dot { background: #B8AEF5; }
    :root[data-theme="dark"] .inbox-body.is-error { color: #F0A3A3; }
    /* Phones: the panel spans the screen just under the bell (its top, height and the point it grows from
       are set by the script, since the header's height differs from page to page) */
    @media (max-width: 600px) {
      .inbox-pop {
        position: fixed; top: 4.6rem; left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); width: auto;
        max-height: calc(100dvh - 6rem - env(safe-area-inset-bottom));
      }
      .inbox-head { padding: .9rem .8rem .5rem 1.1rem; }
      .inbox-list { padding: 0 .35rem .45rem; }
      .inbox-item { gap: .65rem; padding: .65rem .65rem; }
      .inbox-acts { padding-left: calc(2.25rem + .65rem + .65rem); padding-right: .65rem; }
      .inbox-title { font-size: .9rem; }
      .inbox-body { font-size: .83rem; }
    }
    /* Narrow phones where the header can't fit the bell (set by the script): the bell moves into the account
       menu, the count sits on the profile picture, and the panel opens under it */
    [data-acct-host].inbox-compact:not([hidden]) { gap: 0; }
    .inbox-compact .inbox-btn { display: none; }
    .inbox-compact .inbox-pop {
      position: fixed; top: 4.6rem; left: max(12px, env(safe-area-inset-left)); right: max(12px, env(safe-area-inset-right)); width: auto;
      max-height: calc(100dvh - 6rem - env(safe-area-inset-bottom));
    }
    .inbox-compact .acct-btn { position: relative; }
    .inbox-pip-acct { top: -.2rem; right: -.2rem; }
    .inbox-acct-item > span:first-of-type { flex: 1; }
    .inbox-acct-count {
      min-width: 1.25rem; height: 1.25rem; padding: 0 .35rem; box-sizing: border-box; border-radius: 100px; background: var(--pick, #8A5232);
      color: #fff; font: 700 .72rem/1.25rem var(--font-main, system-ui); text-align: center; font-variant-numeric: tabular-nums;
    }
    .inbox-acct-count[hidden] { display: none; }
    /* Touch screens: bigger targets */
    @media (pointer: coarse) {
      .inbox-link { min-height: 2.5rem; padding: .4rem .85rem; }
      .inbox-item { min-height: 3.5rem; }
      .inbox-acts .inbox-act { min-height: 2.5rem; padding: 0 1.1rem; font-size: .84rem; }
      .inbox-more { min-height: 2.75rem; }
    }
    @media (hover: none) { :root :is(.inbox-item, .inbox-link, .inbox-more):hover { background: none; } }
    @media (prefers-reduced-motion: reduce) {
      .inbox-btn, .inbox-pop, .inbox-link, .inbox-item, .inbox-act, .inbox-more { transition: none; }
      .inbox-btn.is-ringing svg { animation: none; }
    }
  `;
  document.head.append(css);

  function ago(iso) {
    const t = Date.parse(iso);
    if (!t) return '';
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  // Where a notification takes you: its own url, or else what it's about:
  //   photos + albumId (+ photoIds)  the album, showing just the photos that were added (albums.html#album=…&photos=…&by=…)
  //   request + albumId              the album's settings, at "Waiting for you" to approve or decline (albums.html#requests=…)
  //   albumId                        the album        groupId   the group        invite   Social's "Needs you"
  function linkOf(n) {
    if (n.url) return safeUrl(n.url);
    if (n.albumId) {
      // (with who asked, so their row is the one ready to answer)
      if (n.type === 'request') return safeUrl('albums#' + new URLSearchParams({ requests: n.albumId, ...(n.actor?.id && { guest: n.actor.id }) }));
      const q = new URLSearchParams({ album: n.albumId });
      if (Array.isArray(n.photoIds) && n.photoIds.length) {
        q.set('photos', n.photoIds.join(','));
        if (n.actor?.name) q.set('by', n.actor.name);
      }
      return safeUrl('albums#' + q);
    }
    if (n.groupId) return safeUrl('events#group=' + encodeURIComponent(n.groupId));
    if (n.type === 'invite') return safeUrl('events#needs');
    return '';
  }
  // Links within Momento (relative ones work wherever the site is opened, even straight from the folder) or
  // plain http(s); never javascript: and the like
  function safeUrl(u) {
    const s = String(u || '').trim();
    if (!s || (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:/i.test(s))) return '';
    try { return new URL(s, location.href).href; } catch (e) { return ''; }
  }

  function mount(host) {
    const wrap = document.createElement('div');
    wrap.className = 'inbox';
    // Shown once the first check works; straight away when it worked earlier in this tab (remembered below),
    // so the header is drawn once with the bell in it instead of shifting when the server answers
    const remembered = bellMemory.get();
    wrap.hidden = !remembered;
    wrap.innerHTML = `
      <button class="inbox-btn glass" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="inboxPop" aria-label="Notifications" title="Notifications">${ICON.bell}<span class="inbox-pip" hidden aria-hidden="true"></span></button>
      <section class="inbox-pop" id="inboxPop" role="dialog" aria-labelledby="inboxTitle" tabindex="-1">
        <header class="inbox-head"><div><h2 id="inboxTitle">Notifications</h2><p class="inbox-sum" id="inboxSum"></p></div><button class="inbox-link" type="button" data-read-all disabled>Mark all read</button></header>
        <ul class="inbox-list" aria-live="polite"></ul>
        <footer class="inbox-foot" hidden><button class="inbox-link" type="button" data-clear-all>Clear all</button></footer>
      </section>`;
    host.prepend(wrap);
    host.classList.add('has-inbox');

    const btn = wrap.querySelector('.inbox-btn'), pip = wrap.querySelector('.inbox-pip'), pop = wrap.querySelector('.inbox-pop');
    const list = wrap.querySelector('.inbox-list'), readAll = wrap.querySelector('[data-read-all]'), sum = wrap.querySelector('#inboxSum');
    const foot = wrap.querySelector('.inbox-foot'), clearBtn = wrap.querySelector('[data-clear-all]');
    pop.setAttribute('aria-describedby', 'inboxSum');
    let items = [], unread = 0, loaded = false, failed = false, open = false, timer = null, gone = false, showOlder = false;

    // ---- Clear all ----
    // Everything up to the newest notification on screen is cleared (anything that arrives meanwhile stays).
    // The cut-off is remembered in this browser too, so a server without POST /api/notifications/clear still
    // keeps them out of the list. For a few seconds it can be undone; then it's sent.
    const cutKey = () => 'momento-inbox-cleared:' + (M.account?.get?.()?.id || 'me');
    const readCut = () => { try { return +localStorage.getItem(cutKey()) || 0; } catch (e) { return 0; } };
    const saveCut = (v) => { try { v ? localStorage.setItem(cutKey(), String(v)) : localStorage.removeItem(cutKey()); } catch (e) {} };
    let cut = readCut(), undo = null;   // undo: { prevCut, prevItems, waiting, timer } while it can still be taken back
    const notCleared = (arr) => (cut ? arr.filter((n) => !(Date.parse(n.at) <= cut)) : arr);
    // What happened after you answered one here ("Let in"), kept until the panel is reloaded: { id: { text, error } }
    const outcome = new Map();

    // ---- Narrow phones: when the header can't fit the bell beside the account chip, the bell moves into the
    // account menu (a "Notifications" item with the count) and the count sits on the profile picture ----
    const acctBtn = () => host.querySelector('.acct-btn');
    let compact = false, menuItem = null, acctPip = null;
    const count = (n) => (n > 9 ? '9+' : String(n));
    function syncCompactBits() {
      const a = acctBtn(), menu = host.querySelector('.acct-menu');
      if (compact && a && !acctPip) { acctPip = document.createElement('span'); acctPip.className = 'inbox-pip inbox-pip-acct'; acctPip.setAttribute('aria-hidden', 'true'); a.append(acctPip); }
      if (!compact && acctPip) { acctPip.remove(); acctPip = null; }
      if (acctPip) { acctPip.hidden = !unread; acctPip.textContent = count(unread); }
      // (Added and removed rather than hidden, so the menu's arrow keys never land on it while it's not shown)
      if (compact && menu && !menuItem) {
        menuItem = document.createElement('button');
        menuItem.type = 'button';
        menuItem.className = 'acct-item inbox-acct-item';
        menuItem.setAttribute('role', 'menuitem');
        menuItem.innerHTML = `${svg(BELL)}<span>Notifications</span><span class="inbox-acct-count"></span>`;
        menuItem.addEventListener('click', (e) => {
          // The account menu treats any item it doesn't know as "Log out": this click must never reach it
          e.stopPropagation();
          const a2 = acctBtn();
          if (a2?.getAttribute('aria-expanded') === 'true') a2.click();   // closes the account menu
          setOpen(true);
        });
        menu.querySelector('.acct-item')?.before(menuItem);
      }
      if (!compact && menuItem) { menuItem.remove(); menuItem = null; }
      if (menuItem) {
        const c = menuItem.querySelector('.inbox-acct-count');
        c.hidden = !unread; c.textContent = count(unread);
        menuItem.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
      }
      const a3 = acctBtn();
      if (a3) a3.setAttribute('aria-label', compact && unread ? `Account menu, ${unread} unread notification${unread === 1 ? '' : 's'}` : 'Account menu');
    }
    // Measured, not a fixed screen width: each page's header holds a different amount
    function fit() {
      if (gone || wrap.hidden || host.hidden) return;   // (home: the account area is hidden until the session is known)
      host.classList.remove('inbox-compact');
      const a = acctBtn(), navEl = host.closest('header')?.querySelector('.nav-wrap, .nav');
      const r = a?.getBoundingClientRect(), b = btn.getBoundingClientRect(), nv = navEl?.getBoundingClientRect();
      const tooWide = !!r && r.width > 0 && (r.right > document.documentElement.clientWidth - 2 || (nv && nv.width > 0 && b.left < nv.right + 2));
      compact = tooWide;
      host.classList.toggle('inbox-compact', compact);
      bellMemory.set(compact ? 'c' : '1');
      syncCompactBits();
      if (open) place();
    }
    let fitQueued = false;
    const queueFit = () => { if (fitQueued) return; fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fit(); }); };

    function setBadge(n) {
      const rose = loaded && n > unread;
      unread = n;
      bellMemory.unread(n);
      pip.hidden = !n;
      pip.textContent = count(n);
      btn.setAttribute('aria-label', n ? `Notifications, ${n} unread` : 'Notifications');
      readAll.disabled = !n;
      syncCompactBits();
      // Something new arrived while the page was open: the bell swings once
      if (rose) { btn.classList.remove('is-ringing'); void btn.offsetWidth; btn.classList.add('is-ringing'); }
    }
    btn.addEventListener('animationend', () => btn.classList.remove('is-ringing'));

    function render() {
      if (failed && !items.length) {
        list.innerHTML = '<li class="inbox-note"><b>Notifications didn’t load</b>Check your connection, then try again.<br><button class="inbox-link" type="button" data-retry>Try again</button></li>';
        list.querySelector('[data-retry]').addEventListener('click', () => refresh());
        return;
      }
      const urgent = items.filter(isUrgent), rest = items.filter((n) => !isUrgent(n)), fresh = rest.filter((n) => !n.read).length;
      // The one line under the title: what's urgent, or that nothing is
      sum.innerHTML = urgent.length
        ? `<b>${urgent.length} urgent</b>${fresh ? `, ${fresh} new` : ''}`
        : fresh ? `${fresh} new, nothing urgent` : items.length ? 'You’re all caught up' : '';
      foot.hidden = !items.length || !!undo;
      if (undo) {
        const left = undo.waiting ? '<br>Join requests still wait in each album’s settings.' : '';
        list.innerHTML = `<li class="inbox-note"><b>Notifications cleared</b>New ones will still show up here.${left}<br><button class="inbox-link" type="button" data-undo>Undo</button></li>`;
        return;
      }
      if (!items.length) {
        list.innerHTML = '<li class="inbox-note"><b>No notifications</b>New photos, guests joining and invites to your albums will show up here.</li>';
        return;
      }
      const older = showOlder ? [] : rest.slice(EARLIER_SHOWN), shownRest = showOlder ? rest : rest.slice(0, EARLIER_SHOWN);
      const group = (cls, title, rows, total) => rows.length ? `<li class="inbox-group ${cls}"><h3 class="inbox-sec">${title}<span>${total}</span></h3><ul class="inbox-sub">${rows.map(row).join('')}</ul></li>` : '';
      list.innerHTML = group('is-needs', 'Urgent', urgent, urgent.length) + group('is-rest', 'Not urgent', shownRest, rest.length)
        + (older.length ? `<li><button class="inbox-more" type="button" data-more>Show ${older.length} older</button></li>` : '');
    }

    function clearAll() {
      if (!items.length || undo) return;
      const prevItems = items, prevCut = cut;
      cut = Math.max(cut, ...items.map((n) => Date.parse(n.at) || 0));
      saveCut(cut);
      undo = { prevItems, prevCut, waiting: items.some((n) => n.type === 'request' && isUrgent(n)) };
      undo.timer = setTimeout(commitClear, UNDO_MS);
      items = [];
      setBadge(0);
      render();
      list.querySelector('[data-undo]')?.focus();
    }
    function undoClear() {
      if (!undo) return;
      clearTimeout(undo.timer);
      cut = undo.prevCut; saveCut(cut);
      items = undo.prevItems; undo = null;
      setBadge(items.filter((n) => !n.read).length);
      render();
      clearBtn.focus();
    }
    // Sent once the undo time is up (or sooner, when the panel closes or the page is left)
    async function commitClear() {
      if (!undo) return;
      clearTimeout(undo.timer);
      undo = null;
      if (open) render();
      const before = new Date(cut).toISOString();
      try {
        await window.momentoApi('/api/notifications/clear', { ...window.momentoJson('POST', { before }), keepalive: true });
      } catch (err) {
        // A server without the clear endpoint: the list stays clear in this browser, and they're marked read
        // so the count on the bell doesn't bring them back
        if (err.status === 404) window.momentoApi('/api/notifications/read', { ...window.momentoJson('POST', {}), keepalive: true }).catch(() => {});
      }
    }
    addEventListener('pagehide', commitClear);
    function row(n) {
      const url = linkOf(n), tag = url ? 'a' : 'button', urgent = isUrgent(n), done = outcome.get(String(n.id));
      const who = n.actor?.name?.trim();
      const av = n.actor?.avatarUrl ? `<img src="${esc(n.actor.avatarUrl)}" alt="">` : who ? esc(who[0].toUpperCase()) : ICON[n.type] || ICON.other;
      const body = done ? `<span class="inbox-body ${done.error ? 'is-error' : 'is-done'}" role="status">${esc(done.text)}</span>` : n.body ? `<span class="inbox-body">${esc(n.body)}</span>` : '';
      return `<li class="inbox-row${n.read ? ' is-seen' : ''}" data-id="${esc(n.id)}"><${tag} class="inbox-item${n.read ? '' : ' is-unread'}" data-id="${esc(n.id)}" ${url ? `href="${esc(url)}"` : 'type="button"'}>
          <span class="inbox-av" aria-hidden="true">${av}${who || n.actor?.avatarUrl ? `<i class="inbox-kind">${KIND[n.type] || KIND.other}</i>` : ''}</span>
          <span class="inbox-text"><span class="inbox-title">${esc(n.title)}</span>${body}</span>
          <span class="inbox-meta"><time class="inbox-time" datetime="${esc(n.at)}">${esc(ago(n.at))}</time>${n.read ? '' : '<i class="inbox-dot" aria-label="Unread"></i>'}</span>
        </${tag}>${urgent ? acts(n, url) : ''}</li>`;
    }
    // A pressing one's buttons: a join request is answered right here; the others open where they're dealt with
    function acts(n, url) {
      const name = esc(n.actor?.name?.trim() || 'them');
      let b = '';
      if (n.type === 'request' && n.albumId && n.actor?.id) {
        b = `<button class="inbox-act as-mini is-dark" type="button" data-act="approve" aria-label="Let ${name} in">Let in</button>`
          + `<button class="inbox-act as-mini" type="button" data-act="decline" data-approve="0" aria-label="Decline ${name}">Decline</button>`;
      } else if (url) {
        const label = { request: 'Review', invite: 'See invite', closing: 'Add photos' }[n.type] || 'Open';
        b = `<button class="inbox-act as-mini is-dark" type="button" data-act="open">${label}</button>`;
      }
      return b ? `<div class="inbox-acts">${b}</div>` : '';
    }
    // Let in or decline a guest who asked to join, without leaving the page
    async function answer(n, approve, btn) {
      const rowEl = btn.closest('.inbox-row');
      rowEl.querySelectorAll('.inbox-act').forEach((x) => { x.disabled = true; });
      btn.textContent = approve ? 'Letting in…' : 'Declining…';
      const first = n.actor?.name?.trim().split(/\s+/)[0] || 'They';
      try {
        await window.momentoApi(`/api/events/${encodeURIComponent(n.albumId)}/requests/${encodeURIComponent(n.actor.id)}`, window.momentoJson('POST', { approve }));
        outcome.set(String(n.id), { text: approve ? `Let in. ${first} can now see the album and add photos.` : `Declined. ${first} won’t see the album.` });
        document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'refresh' } }));
      } catch (err) {
        if (err.status === 404) outcome.set(String(n.id), { text: 'Already answered: they were let in or declined.' });
        else {
          // Not answered: keep it waiting, with the reason and its buttons back
          outcome.set(String(n.id), { text: err.message, error: true });
          render();
          return refocus(n.id, '.inbox-act');
        }
      }
      await markRead([n.id]);
      refocus(n.id, '.inbox-item');
    }
    // After the list is redrawn, focus stays on the notification that was just dealt with
    function refocus(id, sel) {
      const r = [...list.querySelectorAll('.inbox-row')].find((x) => x.dataset.id === String(id));
      (r?.querySelector(sel) || pop).focus({ preventScroll: false });
    }

    async function refresh() {
      if (gone) return;
      try {
        const data = await window.momentoApi('/api/notifications');
        if (undo) return;   // just cleared: the list stays empty until that's undone or sent
        items = notCleared(Array.isArray(data.notifications) ? data.notifications : []);
        failed = false;
        // (the server's count can include ones cleared only in this browser)
        setBadge(Number.isFinite(data.unread) && !cut ? data.unread : items.filter((n) => !n.read).length);
        loaded = true;
        wrap.hidden = false;
        fit();   // (also when it was shown from memory: the account area may only just have appeared)
      } catch (err) {
        // No such endpoint on this server, or signed out: no bell
        if (err.status === 404 || err.status === 401) { stop(true); return; }
        failed = true;
      }
      if (open || !failed) render();
    }

    async function markRead(ids) {
      const all = !ids;
      items.forEach((n) => { if (all || ids.includes(n.id)) n.read = true; });
      setBadge(items.filter((n) => !n.read).length);
      render();
      try {
        const r = await window.momentoApi('/api/notifications/read', { ...window.momentoJson('POST', all ? {} : { ids }), keepalive: true });
        if (Number.isFinite(r.unread) && !cut) setBadge(r.unread);
      } catch (e) { /* the next check puts the true state back */ }
    }
    // Before leaving the page for a notification: the "read" is saved first (at most a short wait), so it can't
    // be lost with the page on phones that drop requests from a page that's closing
    const savedFirst = (p) => Promise.race([p, new Promise((res) => setTimeout(res, 900))]);

    // Phones: the panel is pinned just below the bell (or the profile picture, when the bell is in its menu),
    // as tall as the screen allows, growing out of that button
    const narrow = matchMedia('(max-width: 600px)');
    const anchor = () => (compact && acctBtn()) || btn;
    function place() {
      if (!narrow.matches && !compact) { pop.style.top = pop.style.maxHeight = pop.style.transformOrigin = ''; return; }
      const b = anchor().getBoundingClientRect();
      const top = Math.round(b.bottom + 10);
      pop.style.top = top + 'px';
      pop.style.maxHeight = `calc(100dvh - ${top + 12}px - env(safe-area-inset-bottom))`;
      const left = parseFloat(getComputedStyle(pop).left) || 12;
      pop.style.transformOrigin = `${Math.round(b.left + b.width / 2 - left)}px top`;
    }
    const onResize = () => { queueFit(); if (open) place(); };
    document.fonts?.ready?.then(queueFit);
    addEventListener('resize', onResize);
    narrow.addEventListener('change', onResize);

    const focusables = () => [...pop.querySelectorAll('button:not(:disabled), a[href]')];
    function setOpen(v, refocus) {
      if (v === open) return;
      open = v;
      if (v) place();
      pop.classList.toggle('is-open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v) { showOlder = false; list.scrollTop = 0; render(); pop.focus({ preventScroll: true }); refresh(); }
      else { commitClear(); if (refocus) anchor().focus({ preventScroll: true }); }
    }
    btn.addEventListener('click', () => setOpen(!open));
    readAll.addEventListener('click', () => markRead(null));
    clearBtn.addEventListener('click', clearAll);
    list.addEventListener('click', (e) => {
      if (e.target.closest('[data-undo]')) { undoClear(); return; }
      if (e.target.closest('[data-more]')) {
        showOlder = true; render();
        list.querySelector('.is-rest .inbox-row:nth-child(' + (EARLIER_SHOWN + 1) + ') .inbox-item')?.focus();
        return;
      }
      const act = e.target.closest('[data-act]');
      if (act) {
        const n = items.find((x) => String(x.id) === act.closest('.inbox-row')?.dataset.id);
        if (!n) return;
        if (act.dataset.act === 'open') {
          const href = linkOf(n);
          const saving = n.read ? null : markRead([n.id]);
          setOpen(false);
          if (href) (saving ? savedFirst(saving) : Promise.resolve()).then(() => go(href));
        } else answer(n, act.dataset.act === 'approve', act);
        return;
      }
      const row = e.target.closest('.inbox-item');
      if (!row) return;
      const n = items.find((x) => String(x.id) === row.dataset.id);
      const href = row.tagName === 'A' ? row.href : '';
      // Ctrl/Cmd/Shift-click or a middle click: the browser opens it in a new tab as usual
      const newTab = href && (e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey);
      if (href && !newTab) e.preventDefault();
      // Marked read before going (the request is sent with keepalive, so it survives the page changing).
      // The list is redrawn by this, which is why the link is followed by hand below: Chrome drops the
      // navigation of a link that's taken out of the page while it's being clicked
      const saving = n && !n.read ? markRead([n.id]) : null;
      if (!href || newTab) return;
      setOpen(false);
      (saving ? savedFirst(saving) : Promise.resolve()).then(() => go(href));
    });
    function go(href) {
      const to = new URL(href), here = new URL(location.href);
      const samePage = to.origin === here.origin && to.pathname === here.pathname && to.search === here.search;
      // Exactly where you already are (same page and #part): the browser wouldn't tell the page, so tell it,
      // and it still opens the album or scrolls to the invite
      if (samePage && to.hash && to.hash === here.hash) { dispatchEvent(new HashChangeEvent('hashchange', { oldURL: here.href, newURL: to.href })); return; }
      location.assign(to.href);
    }
    pop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false, true); return; }
      if (e.key !== 'Tab') return;
      // Tab stays inside the panel while it's open
      const f = focusables();
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === pop)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    document.addEventListener('pointerdown', (e) => { if (open && !wrap.contains(e.target)) setOpen(false); }, true);

    // The times ("5m") stay current and new notifications arrive while the tab is in view
    const tick = () => { if (!document.hidden) refresh(); };
    timer = setInterval(tick, POLL_MS);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    // A page marked some read itself (opening an album marks its notifications read): the bell catches up now
    document.addEventListener('momento:notifications', () => refresh());
    function stop(forget) {
      gone = true;
      if (forget) bellMemory.clear();
      document.documentElement.classList.remove('bell-ready');   // no empty space held for it any more
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      removeEventListener('resize', onResize);
      narrow.removeEventListener('change', onResize);
      compact = false; syncCompactBits();
      wrap.remove();
      host.classList.remove('has-inbox', 'inbox-compact');
    }
    // Remembered from earlier in this tab: the bell and its last count are there from the start
    if (!wrap.hidden) { setBadge(bellMemory.unreadWas()); fit(); }
    refresh();
    return { stop };
  }

  // What the bell looked like earlier in this tab (sessionStorage, like the account): '1' beside the account
  // chip, 'c' inside its menu (narrow phones), and the unread count. assets/api.js reads '1' in <head>
  const bellMemory = {
    get() { try { return sessionStorage.getItem('momento-bell'); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem('momento-bell', v); } catch (e) {} },
    unread(n) { try { sessionStorage.setItem('momento-bell-unread', String(n)); } catch (e) {} },
    unreadWas() { try { return Math.max(0, +sessionStorage.getItem('momento-bell-unread') || 0); } catch (e) { return 0; } },
    clear() { try { sessionStorage.removeItem('momento-bell'); sessionStorage.removeItem('momento-bell-unread'); } catch (e) {} document.documentElement.classList.remove('bell-ready'); },
  };

  // One bell per account chip, there only while someone is signed in
  const mounted = new Map();
  function sync(user) {
    document.querySelectorAll('[data-acct-host]').forEach((host) => {
      const has = mounted.get(host);
      if (user && !has) mounted.set(host, mount(host));
      if (!user && has) { has.stop(); mounted.delete(host); }
    });
  }
  async function start() {
    if (!document.querySelector('[data-acct-host]') || !window.momentoApi) return;
    // Signed in earlier in this tab: the bell goes in now, beside the account chip drawn from the same memory,
    // rather than after the server confirms the session (if it doesn't, the bell is taken away again)
    let cached = null;
    try { cached = JSON.parse(sessionStorage.getItem('momento-account') || 'null'); } catch (e) {}
    if (cached) sync(cached);
    const user = await M.sessionReady?.catch?.(() => null);
    sync(user || M.account?.get?.());
    M.account?.onChange?.((u) => sync(u));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
