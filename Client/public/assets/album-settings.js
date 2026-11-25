// Album settings for hosts, on every page.
// - Momento.albumSettings.open(albumId, from)   a sheet to change the album's name, date and place, its cover, who gets in,
//                                               the join deadline, and to let waiting guests in. Hosts only.
// - Momento.groupLink(code)                     the link a group's "Copy link" / share hold (https://api.hexarch.org/s/CODE); its QR code keeps events.html?group=CODE
// An "Album settings" button is also added to the "Album created" screen on every page.
// Built from the site's popup glass (.acct-dialog / .acct-card), like the QR slab, so it matches every other popup.
(() => {
  const Momento = (window.Momento = window.Momento || {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svg = (inner, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const day = (d) => { const t = Date.parse(String(d || '').slice(0, 10) + 'T12:00:00Z'); return Number.isNaN(t) ? String(d || '') : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  const api = (id) => '/api/events/' + encodeURIComponent(id);
  const waitingOf = (a) => (a.requests || []).filter((r) => r.status === 'pending' || r.status === 'approving');
  // What the cover is right now, and what happens to it next, in words
  const coverTag = (c) => !c ? 'No cover yet' : c.source === 'host' ? 'Your cover' : c.source === 'top' ? `Most loved photo${c.score ? ` · ${c.score} ${c.score === 1 ? 'reaction' : 'reactions'}` : ''}` : 'Newest photo';
  function coverNote(a) {
    const upcoming = a.status === 'upcoming' || a.status === 'new', c = a.cover;
    if (upcoming) {
      if (!a.hasHostCover) return 'Add a photo so the album has a face before the event: guests see it on the invite, the Events map and their albums list.';
      return a.keepHostCover ? 'Guests see this before the event and after it starts.' : 'Guests see this until the event starts. Then the photo with the most reactions takes over, unless you keep yours.';
    }
    if (a.hasHostCover && a.keepHostCover) return 'Your cover stays, whichever photo guests love most.';
    if (c?.source === 'top') return 'The photo with the most reactions is the cover now. It moves if another photo overtakes it.';
    if (a.hasHostCover) return 'Your cover shows until a photo gets its first reaction.';
    return 'The photo with the most reactions becomes the cover.';
  }

  // The link for a friend group (the same way an album's link is made)
  Momento.groupLink = (code) => 'https://api.hexarch.org/s/' + encodeURIComponent(code);

  // ---- Styles (scoped to .as-*) ----
  const css = document.createElement('style');
  css.textContent = `
    .as-pop .as-card { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); box-sizing: border-box; overflow: auto; overscroll-behavior: contain; position: relative; }
    .as-pop .acct-x { position: absolute; top: 1rem; right: 1rem; z-index: 3; }
    .as-kick { margin: 0; color: var(--copper, #9A603D); font-size: .76rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
    .as-card h2 { margin: .3rem 2.6rem 0 0; }
    .as-sub { margin: .35rem 0 0; color: var(--slate, #5c596b); font-size: .92rem; line-height: 1.5; }
    .as-sec { margin-top: 1.3rem; padding-top: 1.15rem; border-top: 1px solid rgba(46, 44, 58, .1); }
    :root[data-theme="dark"] .as-sec { border-top-color: rgba(255, 255, 255, .1); }
    .as-sec h3 { display: flex; align-items: center; gap: .5rem; margin: 0 0 .7rem; font-size: .8rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--slate, #5c596b); }
    .as-badge { display: inline-grid; place-items: center; min-width: 1.25rem; height: 1.25rem; padding: 0 .3rem; box-sizing: border-box; border-radius: 100px; background: var(--copper, #9A603D); color: var(--paper, #fff); font-size: .7rem; font-weight: 700; letter-spacing: 0; }
    .as-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .6rem 0; }
    .as-row > span { display: grid; gap: .15rem; }
    .as-row b { font-size: .96rem; font-weight: 650; }
    .as-row small { color: var(--slate, #5c596b); font-size: .82rem; line-height: 1.45; }
    .as-row .acct-sw:disabled { opacity: .4; cursor: not-allowed; }
    .as-row.is-wrap { flex-wrap: wrap; }
    .as-row input:is([type="datetime-local"], [data-mp-kind="datetime-local"]) { height: 2.6rem; padding: 0 .8rem; font: 600 .9rem var(--font-main, inherit); }   /* the well: GlassInput in assets/glass.css */
    :root[data-theme="dark"] .as-row input[type="datetime-local"] { color-scheme: dark; }
    .as-details .acct-field { margin-bottom: .7rem; }
    .as-details .acct-field span i { font-style: normal; font-weight: 500; color: var(--stone, #A9A5B4); }
    .as-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 0 .75rem; }
    .as-save { display: inline-flex; align-items: center; justify-content: center; min-height: 2.8rem; padding: 0 1.4rem; border-radius: 100px; font: 650 .92rem var(--font-main, inherit); cursor: pointer; }   /* buttons here are GlassButton tiers (assets/glass.css) */
    .as-ghost { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; min-height: 2.8rem; padding: 0 1.2rem; border-radius: 100px; font: 650 .92rem var(--font-main, inherit); cursor: pointer; }
    .as-reqs { display: grid; gap: .5rem; margin: 0; padding: 0; list-style: none; }
    .as-reqs li { display: flex; align-items: center; gap: .7rem; padding: .55rem .55rem .55rem .6rem; border-radius: var(--r-group, 16px); background: rgba(255, 255, 255, .5); box-shadow: inset 0 0 0 1px rgba(46, 44, 58, .07); }
    :root[data-theme="dark"] .as-reqs li { background: rgba(255, 255, 255, .05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, .08); }
    /* The person a notification was about (when more than one is waiting) */
    .as-reqs li.is-asked { box-shadow: inset 0 0 0 2px var(--copper, #9A603D); }
    :root[data-theme="dark"] .as-reqs li.is-asked { box-shadow: inset 0 0 0 2px #B8AEF5; }
    .as-av { display: grid; place-items: center; flex: none; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: linear-gradient(135deg, #D6CDEC, #EBD3DC 55%, #C6DEDA); color: #2E2C3A; font-style: normal; font-weight: 700; font-size: .9rem; }
    .as-reqs li > span { display: grid; flex: 1; min-width: 0; }
    .as-reqs li b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .as-reqs li small { color: var(--slate, #5c596b); font-size: .8rem; }
    .as-none { margin: 0; color: var(--slate, #5c596b); font-size: .9rem; line-height: 1.5; }
    .as-mini { min-height: 2.2rem; padding: 0 .9rem; border-radius: 100px; font: 650 .82rem var(--font-main, inherit); cursor: pointer; }
    .as-mini:disabled { cursor: progress; }
    .as-code { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: .7rem; }
    .as-code span { display: grid; gap: .1rem; }
    .as-code small { color: var(--slate, #5c596b); font-size: .78rem; font-weight: 600; }
    .as-code b { font: 750 1.3rem/1.2 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; letter-spacing: .1em; }
    .as-share { display: flex; flex-wrap: wrap; gap: .5rem; }
    /* Cover: the host's own image while upcoming, then the most loved photo (unless they keep theirs) */
    .as-cover-pic { position: relative; isolation: isolate; display: grid; place-items: center; aspect-ratio: 16 / 7; margin-bottom: .75rem; border-radius: 18px; overflow: hidden;
      background: radial-gradient(90% 140% at 0% 0%, rgba(201, 192, 226, .55), transparent 62%), radial-gradient(90% 140% at 100% 100%, rgba(169, 204, 200, .5), transparent 62%), rgba(127, 120, 150, .08);
      box-shadow: 0 1px 2px rgba(46, 44, 58, .06), 0 12px 26px -18px rgba(74, 62, 120, .5); }
    .as-cover-pic img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .as-cover-pic.has-pic::before { content: ''; position: absolute; inset: 0; z-index: 1; background: #D9D0EA; mix-blend-mode: multiply; opacity: .18; pointer-events: none; }
    .as-cover-pic.has-pic::after { content: ''; position: absolute; inset: 0; z-index: 1; background: linear-gradient(to top, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0) 55%); pointer-events: none; }
    .as-cover-pic > b { font-size: 2rem; font-weight: 700; letter-spacing: -.03em; color: rgba(46, 44, 58, .45); }
    .as-cover-tag { position: absolute; left: .75rem; bottom: .65rem; z-index: 2; display: inline-flex; align-items: center; gap: .35rem; padding: .3rem .7rem; border-radius: 100px;
      background: rgba(255, 255, 255, .9); color: #2E2C3A; font-size: .78rem; font-weight: 650; box-shadow: 0 4px 14px -6px rgba(20, 16, 40, .5); }
    .as-cover-pic:not(.has-pic) .as-cover-tag { background: rgba(255, 255, 255, .7); }
    .as-cover .as-none { margin-bottom: .75rem; font-size: .86rem; }
    .as-cover .as-row { margin-top: .5rem; padding-bottom: 0; }
    .as-cover-file { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    :root[data-theme="dark"] .as-cover-pic { background: radial-gradient(90% 140% at 0% 0%, rgba(120, 104, 176, .4), transparent 62%), radial-gradient(90% 140% at 100% 100%, rgba(80, 130, 126, .38), transparent 62%), rgba(255, 255, 255, .04); }
    :root[data-theme="dark"] .as-cover-pic > b { color: rgba(255, 255, 255, .4); }
    :root[data-theme="dark"] .as-cover-tag, :root[data-theme="dark"] .as-cover-pic:not(.has-pic) .as-cover-tag { background: var(--g-hud); color: #fff; box-shadow: var(--g-sh-hud); }
    .as-status { min-height: 1.2rem; margin: .9rem 0 0; color: var(--slate, #5c596b); font-size: .85rem; font-weight: 500; }
    .as-status.is-error { color: #9A3D3D; }
    :root[data-theme="dark"] .as-status.is-error { color: #F0A3A3; }
    @media (max-width: 460px) { .as-pair { grid-template-columns: 1fr; } .as-pop .as-card { padding: 1.3rem 1.2rem 1.1rem; } }
    /* Phones: a waiting guest's name gets the row, Approve and Decline share the line under it */
    @media (max-width: 460px) {
      .as-reqs li { flex-wrap: wrap; row-gap: .55rem; }
      .as-reqs li > span { flex: 1 1 calc(100% - 3rem); }
      .as-reqs li .as-mini { flex: 1 1 0; min-height: 2.5rem; }
    }
    @media (prefers-reduced-motion: reduce) { .as-save, .as-ghost, .as-mini { transition: none; scale: none !important; } }`;
  document.head.append(css);

  let current = null;   // the sheet that's open: { d, id, from }

  // opts.focus === 'requests': opens scrolled to "Waiting for you", on the first Approve (from a notification)
  async function open(id, from, opts = {}) {
    if (!id || current) return;
    let album;
    try { ({ album } = await momentoApi('/api/albums/' + encodeURIComponent(id))); }
    catch (err) { Momento.toast?.('Couldn’t open settings', err.message); return; }
    if (!album || album.role !== 'host') { Momento.toast?.('Only the host can change this album', album?.name || ''); return; }

    const d = document.createElement('dialog');
    d.className = 'acct-dialog as-pop';
    d.setAttribute('aria-labelledby', 'asTitle');
    d.innerHTML = '<div class="acct-card as-card"></div>';
    document.body.append(d);
    const card = d.querySelector('.as-card');
    current = { d, id, from };
    let a = album, closing = false;

    const say = (text, bad) => { const s = card.querySelector('.as-status'); if (s) { s.textContent = text || ''; s.classList.toggle('is-error', !!bad); } };
    const announce = () => document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'update', album: a } }));
    async function reload(keep) {
      ({ album: a } = await momentoApi('/api/albums/' + encodeURIComponent(id)));
      paint(keep);
    }

    function paint(keep) {
      const scroll = card.scrollTop, note = keep ? [card.querySelector('.as-status')?.textContent, card.querySelector('.as-status')?.classList.contains('is-error')] : ['', false];
      const waiting = waitingOf(a);
      const deadline = a.joinDeadline ? new Date(a.joinDeadline) : null;
      const local = deadline ? new Date(+deadline - deadline.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      const km = a.zone?.radiusM ? `${+(a.zone.radiusM / 1000).toFixed(1)} km` : '';
      const sw = (key, on, title, text, disabled) => `<div class="as-row"><span><b id="asL-${key}">${title}</b><small>${text}</small></span><button class="acct-sw" type="button" role="switch" data-key="${key}" aria-labelledby="asL-${key}" aria-checked="${on}"${disabled ? ' disabled' : ''}></button></div>`;
      card.innerHTML = `
        <button class="acct-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
        <p class="as-kick">Album settings</p>
        <h2 id="asTitle">${esc(a.name)}</h2>
        <p class="as-sub">${esc([day(a.date), a.venue?.address || (window.Momento?.event?.isPlaceholder?.(a.place) ? '' : a.place)].filter(Boolean).join(' · '))}</p>

        <form class="as-sec as-details" aria-labelledby="asDetails" novalidate>
          <h3 id="asDetails">Details</h3>
          <label class="acct-field"><span>Album name</span><input name="name" maxlength="60" autocomplete="off" value="${esc(a.name)}"></label>
          <div class="as-pair">
            <label class="acct-field"><span>Date</span><input name="date" type="date" value="${esc(String(a.date || '').slice(0, 10))}"></label>
            <label class="acct-field"><span>Place <i>(optional)</i></span><input name="place" maxlength="60" autocomplete="off" value="${esc((window.Momento?.event?.isPlaceholder?.(a.place) ? '' : a.place) || '')}" placeholder="Where it’s on"></label>
          </div>
          <button class="as-save" type="submit">Save details</button>
        </form>

        <section class="as-sec as-cover" aria-labelledby="asCover">
          <h3 id="asCover">Cover</h3>
          <div class="as-cover-pic${a.cover?.thumbUrl ? ' has-pic' : ''}">${a.cover?.thumbUrl ? `<img src="${esc(a.cover.url || a.cover.thumbUrl)}" alt="">` : `<b aria-hidden="true">${esc((String(a.name || '·').trim()[0] || '·').toUpperCase())}</b>`}<span class="as-cover-tag">${esc(coverTag(a.cover))}</span></div>
          <p class="as-none">${esc(coverNote(a))}</p>
          <div class="as-share">
            <button class="as-ghost" type="button" data-cover-pick>${a.hasHostCover ? 'Change cover' : 'Choose a cover'}</button>
            ${a.hasHostCover ? '<button class="as-ghost" type="button" data-cover-remove>Remove</button>' : ''}
          </div>
          <input class="as-cover-file" type="file" accept="image/*" tabindex="-1" aria-hidden="true">
          ${a.hasHostCover ? sw('keepHostCover', !!a.keepHostCover, 'Keep my cover', 'When off, the photo with the most reactions takes over once the event is live') : ''}
        </section>

        <section class="as-sec" aria-labelledby="asRules">
          <h3 id="asRules">Who gets in</h3>
          ${sw('joiningOpen', a.joiningOpen !== false, 'Accept new guests', 'When off, anyone with the code asks you first')}
          ${a.group || !a.zone ? '' /* only albums with a venue zone (events) can check location; plain albums have no place to check against */ : sw('locationRequired', a.locationRequired !== false, 'Check location on entry', `Guests within ${km} of the venue get straight in. Anyone else waits for you`)}
          <label class="as-row is-wrap"><span><b>Join deadline</b><small>Leave empty to close joining when the event ends</small></span><input type="datetime-local" id="asDeadline" value="${local}"></label>
        </section>

        <section class="as-sec" aria-labelledby="asReqs">
          <h3 id="asReqs">Waiting for you ${waiting.length ? `<b class="as-badge">${waiting.length}</b>` : ''}</h3>
          ${waiting.length ? `<ul class="as-reqs">${waiting.map((r) => `
            <li data-guest="${esc(r.user)}"><i class="as-av" aria-hidden="true">${esc((String(r.name || 'G').trim()[0] || 'G').toUpperCase())}</i>
              <span><b>${esc(r.name || 'Guest')}</b><small>${r.status === 'approving' ? 'Being let in…' : 'Asked to join'}</small></span>
              <button class="as-mini is-dark" type="button" data-approve="1">Approve</button><button class="as-mini" type="button" data-approve="0">Decline</button></li>`).join('')}</ul>`
          : '<p class="as-none">No one is waiting. Guests who can’t check in, or who try after joining closes, show up here.</p>'}
        </section>

        ${a.code ? `
        <section class="as-sec" aria-labelledby="asShare">
          <h3 id="asShare">Invite guests</h3>
          <div class="as-code"><span><small>Guest code</small><b>${esc(a.code)}</b></span></div>
          <div class="as-share">
            <button class="as-ghost" type="button" data-link>Copy link</button>
            <button class="as-ghost" type="button" data-qr>Show QR code</button>
          </div>
        </section>` : ''}
        <p class="as-status" role="status"></p>`;
      card.scrollTop = scroll;
      say(...note);

      card.querySelector('[data-close]').addEventListener('click', dismiss);

      // Details: name, date and place
      const form = card.querySelector('.as-details');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = form.name.value.trim(), date = form.date.value, place = form.place.value.trim();
        if (!name) { say('Give the album a name, like the event it’s for.', true); form.name.focus(); return; }
        if (!date) { say('Pick the date of the event.', true); form.date.focus(); return; }
        if (name === a.name && date === String(a.date).slice(0, 10) && place === (a.place || '')) { say('Nothing to change.'); return; }
        const b = form.querySelector('.as-save'); b.disabled = true;
        try {
          await momentoApi('/api/albums/' + encodeURIComponent(id), momentoJson('PATCH', { name, date, place }));
          await reload();
          say('Details saved.');
          announce();
        } catch (err) { say(err.message, true); }
        finally { b.disabled = false; }
      });

      // Cover: choose (or change) the host's image, take it off, or keep it once the event is live
      const coverFile = card.querySelector('.as-cover-file'), pickBtn = card.querySelector('[data-cover-pick]');
      pickBtn.addEventListener('click', () => coverFile.click());
      coverFile.addEventListener('change', async () => {
        const f = coverFile.files?.[0];
        coverFile.value = '';
        if (!f) return;
        pickBtn.disabled = true; say('Uploading the cover…');
        try {
          const blob = Momento.event?.prepareCover ? await Momento.event.prepareCover(f) : f;
          const fd = new FormData();
          fd.append('cover', blob, blob.type === 'image/webp' ? 'cover.webp' : blob.type === 'image/jpeg' ? 'cover.jpg' : (f.name || 'cover'));
          await momentoApi('/api/albums/' + encodeURIComponent(id) + '/cover', { method: 'PUT', body: fd });
          await reload(true); say('Cover saved.'); announce();
          card.querySelector('[data-cover-pick]')?.focus();
        } catch (err) { pickBtn.disabled = false; say(err.message, true); }
      });
      card.querySelector('[data-cover-remove]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await momentoApi('/api/albums/' + encodeURIComponent(id) + '/cover', { method: 'DELETE' });
          await reload(true); say('Cover removed.'); announce();
          card.querySelector('[data-cover-pick]')?.focus();
        } catch (err) { btn.disabled = false; say(err.message, true); }
      });
      card.querySelector('.acct-sw[data-key="keepHostCover"]')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget, on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(on)); btn.style.pointerEvents = 'none';
        try {
          await momentoApi('/api/albums/' + encodeURIComponent(id), momentoJson('PATCH', { keepHostCover: on }));
          await reload(); say(on ? 'Your cover stays.' : 'The most loved photo takes over once the event is live.'); announce();
          card.querySelector('[data-key="keepHostCover"]')?.focus();
        } catch (err) { btn.setAttribute('aria-checked', String(!on)); btn.style.pointerEvents = ''; say(err.message, true); }
      });

      // Switches save straight away and flip back if the server says no
      card.querySelectorAll('.acct-sw[data-key]:not([data-key="keepHostCover"])').forEach((btn) => btn.addEventListener('click', async () => {
        const on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(on)); btn.style.pointerEvents = 'none';
        try {
          await momentoApi(api(id) + '/policy', momentoJson('PATCH', { [btn.dataset.key]: on }));
          await reload(); say('Saved.'); announce();
          card.querySelector(`[data-key="${btn.dataset.key}"]`)?.focus();
        } catch (err) { btn.setAttribute('aria-checked', String(!on)); btn.style.pointerEvents = ''; say(err.message, true); }
      }));
      card.querySelector('#asDeadline').addEventListener('change', async (e) => {
        const v = e.target.value;
        try {
          await momentoApi(api(id) + '/policy', momentoJson('PATCH', { joinDeadline: v ? new Date(v).toISOString() : null }));
          await reload(); say(v ? 'Deadline saved.' : 'Deadline cleared: joining closes when the event ends.'); announce();
        } catch (err) { say(err.message, true); }
      });

      // Waiting guests
      card.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', async () => {
        const row = btn.closest('li'), approve = btn.dataset.approve === '1';
        row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try {
          await momentoApi(api(id) + '/requests/' + encodeURIComponent(row.dataset.guest), momentoJson('POST', { approve }));
          await reload(); say(approve ? 'Let in. They’re now a guest.' : 'Declined. They won’t see the album.'); announce();
        } catch (err) { row.querySelectorAll('button').forEach((b) => { b.disabled = false; }); say(err.message, true); }
      }));

      // Sharing
      card.querySelector('[data-link]')?.addEventListener('click', (e) => Momento.shareInvite?.(a, e.currentTarget, 'Copy link'));
      card.querySelector('[data-qr]')?.addEventListener('click', (e) => Momento.qr?.show(a, e.currentTarget));
    }

    const dismiss = async () => {
      if (closing || !d.open) return;
      closing = true;
      if (!still()) { try { await card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(.97)' }], { duration: 200, easing: 'ease-in', fill: 'forwards' }).finished; } catch (e) {} }
      d.close();
    };
    d.addEventListener('close', () => { current = null; d.remove(); from?.isConnected && from.focus?.({ preventScroll: true }); });
    d.addEventListener('cancel', (e) => { e.preventDefault(); dismiss(); });
    d.addEventListener('pointerdown', (e) => { d._down = e.target === d; });
    d.addEventListener('click', (e) => { if (e.target === d && d._down) dismiss(); });

    paint();
    d.showModal();
    if (!still()) {
      card.animate([{ opacity: 0, transform: 'translateY(14px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.34, 1.4, .64, 1)' });
      try { d.animate({ opacity: [0, 1] }, { duration: 300, pseudoElement: '::backdrop' }); } catch (e) {}
    }
    card.querySelector('.as-details input')?.blur();
    if (opts.focus === 'requests') {
      const sec = card.querySelector('#asReqs')?.closest('.as-sec');
      // The card's own scroll, so the page behind stays put
      if (sec) card.scrollTop = Math.max(0, sec.offsetTop - 16);
      // The person the notification was about, when they're still waiting; otherwise the first person waiting
      const row = opts.guest && [...card.querySelectorAll('.as-reqs li')].find((li) => li.dataset.guest === opts.guest);
      if (row && card.querySelectorAll('.as-reqs li').length > 1) { row.classList.add('is-asked'); row.scrollIntoView({ block: 'nearest' }); }
      ((row || card).querySelector('[data-approve="1"]') || card.querySelector('[data-close]'))?.focus({ preventScroll: true });
      if (!card.querySelector('[data-approve]')) say('No one is waiting any more: they were let in or declined already.');
    } else card.querySelector('[data-close]')?.focus();
  }

  Momento.albumSettings = { open };

  // Links like albums.html#requests=<albumId>&guest=<userId> (from a notification) open the album's settings at
  // "Waiting for you", on that person's Approve
  async function requestsFromHash() {
    if (!/^#requests=/.test(location.hash)) return;
    const q = new URLSearchParams(location.hash.slice(1)), id = q.get('requests');
    history.replaceState(null, '', location.pathname + location.search);
    const user = await Momento.sessionReady?.catch?.(() => null);
    if (!id || !user || !user.emailVerified) return;
    open(id, null, { focus: 'requests', guest: q.get('guest') || '' });
  }
  addEventListener('hashchange', requestsFromHash);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', requestsFromHash); else requestsFromHash();

  // A newly created album: "Album settings" goes on the "Album created" screen, above the QR code button
  document.addEventListener('momento:albums', (e) => {
    const { type, album } = e.detail || {};
    const dlg = document.getElementById('mCreate');
    if (type !== 'add' || !album?.id || album.role === 'guest' || !dlg?.open) return;
    const doneView = dlg.querySelector('.m-done');
    if (!doneView) return;
    // The screen has a quiet "Album settings" link at its foot (CreateDialog); it's shown once the album exists
    const btn = doneView.querySelector('[data-album-settings]');
    if (!btn) return;
    btn.hidden = false;
    btn.onclick = () => open(album.id, btn);
  });
})();
