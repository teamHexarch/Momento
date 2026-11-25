/* My albums: the page's own behaviour (moved from public/legacy/albums-1.js).
   The code is the original, unchanged: it still drives the server-rendered markup by id and class. It is started by
   <AlbumsScripts> (through LegacyScripts) at the point the first old script used to run, so its DOMContentLoaded and load
   listeners still run in their original order. Converting it into React components is the next step for this page. */
/* eslint-disable */
import { createPageEffects } from '@/components/effects/pageEffects.js';
import installEmoji from './emoji.js';

export default function start() {
  installEmoji(); // window.MomentoEmoji, the reaction list: read as this code starts (it was the script before it)
  // ======== from albums-1.js ========
    const still =matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer = matchMedia('(pointer: fine)').matches;
    const root = document.documentElement;
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const easeOut = (v) => 1 - Math.pow(1 - v, 3);
    const OUT = 'cubic-bezier(.16, 1, .3, 1)';

    // ---- Cursor, silk background, glass light, buttons, and the loop: src/components/effects/pageEffects.js ----
    const fx = createPageEffects({ rimThrottle: true });
    const { pointer, useCursor, lightUp, rollButton } = fx;
    // The viewport height, kept current (the scroll effects below use it)
    let vh = innerHeight;
    addEventListener('resize', () => { vh = innerHeight; });

    // ---- Albums ----
    const ALBUMS = [];
    const fromStore = (a) => ({ ...a, place: (window.Momento?.event?.isPlaceholder?.(a.place) ? '' : a.place), status: a.status === 'upcoming' ? 'new' : a.status, pics: a.pics || [], photos: a.photos || 0, mine: a.mine || 0, guests: a.guests || 0 });
    const TODAY = new Date();
    const daysTo = (d) => Math.round((new Date(d + 'T12:00') - TODAY) / 864e5);
    const closesIn = (a) => daysTo(a.closes);
    const inDays = (n) => n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days';
    // Small pictures: when the server sends a 320px "mini" (miniUrl) beside the 600px thumbnail, the browser picks
    // whichever suits the space (srcset); until then this is just the thumbnail, as before. sizes: how wide it shows
    const GRID_SIZES = '(max-width: 699px) 34vw, (max-width: 999px) 20vw, 170px';
    function smallImg(p, fallback, sizes = GRID_SIZES) {
      const thumb = p.thumbnailUrl || fallback || p.url || '';
      if (!p.miniUrl) return `src="${esc(thumb)}"`;
      return `src="${esc(p.miniUrl)}" srcset="${esc(p.miniUrl)} 320w, ${esc(thumb)} 600w" sizes="${sizes}"`;
    }
    const pic = (id, w = 600, h = Math.round(w * .8)) => (typeof id === 'string' ? id : `https://picsum.photos/id/${id}/${w}/${h}`);
    // The album's cover: the host's own image while it's upcoming, then its most loved photo (the server decides)
    // (the first photo in the server's order, whatever order the album window is showing them in)
    const coverPic = (a) => { if (a.cover?.thumbUrl) return a.cover.thumbUrl; const i = (a.photoItems || []).findIndex((p) => p._o === 0); return a.pics?.[i >= 0 ? i : 0] || null; };
    const fmtDate = (d) => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    const num = (n) => n.toLocaleString('en-GB');
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const byId = (id) => ALBUMS.find((a) => a.id === id);
    const ARCHIVE = ALBUMS;

    const kept = () => ALBUMS.filter((a) => !a.gone);
    const tally = (st) => kept().filter((a) => a.status === st).length;
    const photos = kept().reduce((t, a) => t + a.photos, 0), mine = kept().reduce((t, a) => t + a.mine, 0);
    // Until the list has come from the server there is nothing to sum up: the lede keeps saying it's loading (it's in
    // the page that way) and the tab counts stay empty, rather than flashing "No albums yet" and zeros first
    let albumsLoaded = false;
    function sumUp(first) {
      if (!albumsLoaded && !ALBUMS.length) return;
      const list = kept(), p = list.reduce((t, a) => t + a.photos, 0), m = list.reduce((t, a) => t + a.mine, 0), up = tally('new');
      const n = (v) => (first ? `<b data-count="${v}">0</b>` : `<b>${num(v)}</b>`);
      document.getElementById('lede').innerHTML = list.length ? `${n(list.length)} ${list.length === 1 ? 'album' : 'albums'} · ${n(p)} photos · ${n(m)} yours` : 'No albums yet';
      const arch = list, counts = { all: arch.length, host: arch.filter((a) => a.role === 'host').length };
      counts.guest = counts.all - counts.host;
      counts.group = arch.filter((a) => a.group).length;
      document.querySelectorAll('.tab').forEach((t) => { const s = t.querySelector('small'); if (s) s.textContent = counts[t.dataset.filter]; });
    }
    sumUp(true);

    const liveEl = document.getElementById('live');
    liveEl.classList.add('is-pending');
    liveEl.innerHTML = '<div class="live-media" aria-hidden="true"></div><div class="live-actions" aria-hidden="true"><span class="btn live-ghost"></span><span class="btn live-ghost"></span></div>';
    // The placeholder gives way once: to the real card (faded up), or to nothing (faded out, then hidden)
    let liveTimer = 0;
    function liveSettle(show) {
      const first = liveEl.classList.contains('is-pending');
      liveEl.classList.remove('is-pending');
      clearTimeout(liveTimer);
      if (show) {
        liveEl.classList.remove('is-leaving');
        liveEl.hidden = false;
        if (first) { liveEl.classList.add('is-revealing'); liveTimer = setTimeout(() => liveEl.classList.remove('is-revealing'), 1000); }
        return;
      }
      const gone = () => { liveEl.hidden = true; liveEl.classList.remove('is-leaving'); liveEl.replaceChildren(); };
      if (first && !liveEl.hidden && !still) { liveEl.classList.add('is-leaving'); liveTimer = setTimeout(gone, 350); }
      else gone();
    }
    // The card beside "My albums" is only there when something is happening: the album that's live now, or
    // else the one closing soonest. Every album is in the list below anyway, so otherwise there's no card
    function featuredAlbum() {
      const live = ALBUMS.find((a) => a.status === 'live');
      if (live) return { album: live, label: 'Live now', live: true };
      const wrapping = ALBUMS.filter((a) => a.status === 'wrapping' && a.pics.length).sort((a, b) => closesIn(a) - closesIn(b))[0];
      if (wrapping) return { album: wrapping, label: `Closes ${inDays(closesIn(wrapping))}` };
      return null;
    }
    function renderLive() {
      const pick = featuredAlbum();
      if (!pick) { liveSettle(false); return; }
      const { album, label, live } = pick;
      // Refreshing with the same photo keeps it showing; a new one fades in once it has loaded
      const shownSrc = liveEl.querySelector('.live-img.is-on')?.getAttribute('src');
      // "Add your photos" only while photos can still be added (the host can always add)
      const canAddHere = album.open !== false || (album.role === 'host' && !!album.startsAt);
      liveEl.innerHTML = `
        <div class="live-media" role="button" tabindex="0" aria-label="Open ${esc(album.name)}">
          ${coverPic(album) ? `<img class="live-img${shownSrc === coverPic(album) ? ' is-on' : ''}" src="${esc(coverPic(album))}" alt="" decoding="async">` : '<div class="cover-new"><small>No photos yet</small></div>'}
          <span class="live-pill">${live ? '<i></i>' : ''}${esc(label)}</span>
          <div class="live-over"><h2 id="liveTitle">${esc(album.name)}</h2><p>${esc([album.place, `${num(album.photos)} photos`].filter(Boolean).join(' · '))}</p></div>
        </div>
        <div class="live-actions"><button class="btn btn-dark" type="button">Open album</button>${canAddHere ? '<button class="btn btn-light" type="button">Add your photos</button>' : ''}</div>`;
      const img = liveEl.querySelector('.live-img:not(.is-on)');
      if (img) {
        const on = () => img.classList.add('is-on');
        if (img.complete) requestAnimationFrame(on); else { img.addEventListener('load', on, { once: true }); img.addEventListener('error', on, { once: true }); }
      }
      liveSettle(true);
      const media = liveEl.querySelector('.live-media');
      media.addEventListener('click', () => openAlbum(album.id));
      media.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openAlbum(album.id); } });
      const [open, add] = liveEl.querySelectorAll('button');
      open.addEventListener('click', () => openAlbum(album.id));
      add?.addEventListener('click', () => openAlbum(album.id, 0, null, true));
    }

    // ---- The archive: albums built once, then regrouped by year as filters change ----
    const yearsEl = document.getElementById('years');
    setTimeout(() => yearsEl.classList.remove('is-loading'), 6000);   // never holds room for long if the albums can't load
    const cards = new Map(), years = new Map();

    const reveal = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      reveal.unobserve(e.target);
    }), { rootMargin: '0px 0px -8% 0px' });

    // Where an album is in its life: closing soon is loud, kept is quiet
    function statusTag(a) {
      if (a.status === 'live') return '<span class="tag status live"><i></i>Live now</span>';
      if (a.status === 'new') {
        // Albums made here count from the real today, not the sample data's
        const now = new Date(); now.setHours(12, 0, 0, 0);
        const d = Math.round((new Date(a.date + 'T12:00') - now) / 864e5);
        return `<span class="tag status soon"><i></i>${d > 0 ? `Starts ${inDays(d)}` : d === 0 ? 'Today' : 'New'}</span>`;
      }
      if (a.status === 'wrapping') {
        const d = closesIn(a);
        return `<span class="tag status ${d <= 3 ? 'closing' : 'soon'}"><i></i>Closes ${inDays(d)}</span>`;
      }
      return '<span class="tag status kept"><i></i>Kept</span>';
    }

    // A bookmark on the cover saves the album (it's a span, since a button can't sit inside the card's button)
    const bookmarkHtml = (a) => `<button class="bookmark" type="button" aria-pressed="${!!a.saved}" aria-label="${a.saved ? 'Remove' : 'Save'} ${esc(a.name)}" title="${a.saved ? 'Saved. Click to remove' : 'Save album'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/></svg></button>`;
    // A card is an <article>: one full-card button opens the album (it sits over the picture and text), and
    // the bookmark is its own button above that. Never a button inside a button, for screen readers and keyboards
    function makeCard(a, n) {
      const el = document.createElement('article');
      el.className = 'album'; el.dataset.id = a.id;
      el.innerHTML = `
        <button class="album-hit" type="button" aria-label="Open ${esc(a.name)}"></button>
        <span class="frame glass">
          <span class="media">
            <span class="cover">${coverPic(a) ? `<img src="${esc(pic(coverPic(a), 1100, 620))}" alt="" loading="lazy">` : `<span class="cover-new" aria-hidden="true"><b>${esc((a.name.trim()[0] || '·').toUpperCase())}</b><small>No photos yet</small></span>`}
              ${statusTag(a)}${bookmarkHtml(a)}</span>
          </span>
          <span class="info">
            <span class="name">${esc(a.name)}</span>
            <span class="when">${esc([fmtDate(a.date), a.place].filter(Boolean).join(', '))}</span>
            <span class="foot-row">${a.guests ? `<span>${num(a.photos)} photos from ${a.guests} guests</span>` : `<span>${a.photos ? `${num(a.photos)} photos so far` : 'Waiting for the first photos'}${a.code ? `, code ${a.code}` : ''}</span>`}${a.group ? `<span class="grp" title="Shared with ${esc(a.group.name)}"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="16.8" cy="9.5" r="2.5"/><path d="M15.6 14.6c2.4-.2 4.3 1.3 4.9 4.4"/></svg>${esc(a.group.name)}</span>` : ''}<span class="role${a.role === 'host' ? ' host' : ''}"${a.role !== 'host' && a.hostName ? ` title="Host: ${esc(a.hostName)}"` : ''}>${a.role === 'host' ? 'You’re hosting' : a.hostName ? 'Host: ' + esc(a.hostName) : 'Joined'}${pipHtml(a)}</span></span>
          </span>
        </span>`;
      el.cover = el.querySelector('.cover');
      el.img = el.cover.querySelector('img');
      // The cover fades in once it has loaded and decoded, rather than painting in strips over the grey (albums.css);
      // one already in the cache (a redrawn card) shows at once
      if (el.img) {
        const img = el.img, on = () => img.classList.add('is-loaded');
        img.decoding = 'async';
        if (img.complete && img.naturalWidth) on();
        else { img.addEventListener('load', on, { once: true }); img.addEventListener('error', on, { once: true }); }
      }
      el.querySelector('.album-hit').addEventListener('click', () => openAlbum(a.id, 0, el.img));
      el.querySelector('.bookmark').addEventListener('click', (e) => { e.stopPropagation(); toggleSave(a); });
      lightUp(el.querySelector('.frame'));
      return el;
    }
    ARCHIVE.forEach((a, n) => cards.set(a.id, makeCard(a, n)));

    // A chapter is a year, or "Wrapping up" for albums that are about to close
    function yearBlock(y, chapter = false) {
      if (!years.has(y)) {
        const el = document.createElement('section');
        el.className = chapter ? 'year chapter' : 'year';
        el.innerHTML = `
          <div class="year-side">
            <h2 class="year-num">${y}</h2>
            <p class="year-meta"></p>
          </div>
          <div class="grid"></div>`;
        years.set(y, { el, grid: el.querySelector('.grid'), meta: el.querySelector('.year-meta') });
        reveal.observe(el);
      }
      return years.get(y);
    }

    let filter = 'all', query = '';
    function render(animate = true) {
      // Bookmarked (filter 'liked') is a page of its own: albums you saved, then photos you bookmarked
      const onLiked = filter === 'liked';
      yearsEl.hidden = onLiked;
      document.getElementById('likedView').hidden = !onLiked;
      if (onLiked) { document.getElementById('empty').hidden = true; renderLiked(); return; }
      const q = query.trim().toLowerCase();
      const shown = ARCHIVE.filter((a) => !a.gone && (filter === 'all' || (filter === 'group' ? !!a.group : a.role === filter)) && (!q || `${a.name} ${a.place} ${a.group?.name || ''}`.toLowerCase().includes(q)));
      // FLIP: note where every album is, regroup, then glide each from its old spot to its new one
      const first = new Map();
      if (animate) for (const [id, el] of cards) if (el.isConnected) first.set(id, el.getBoundingClientRect());
      // Albums about to close come first, soonest at the top; everything else is kept by year
      const closing = shown.filter((a) => a.status === 'wrapping').sort((a, b) => closesIn(a) - closesIn(b));
      const byYear = {};
      for (const a of shown) if (a.status !== 'wrapping') (byYear[a.date.slice(0, 4)] ||= []).push(a);
      yearsEl.replaceChildren();
      const fill = (b, list, meta) => {
        b.meta.textContent = meta;
        b.grid.replaceChildren(...list.map((a) => cards.get(a.id)));
        yearsEl.append(b.el);
      };
      if (closing.length) {
        const n = closing.length;
        fill(yearBlock('Wrapping up', true), closing, `${n} album${n > 1 ? 's' : ''} closing soon. Add or download photos while you can.`);
      }
      for (const y of Object.keys(byYear).sort().reverse()) {
        const list = byYear[y], n = list.length;
        fill(yearBlock(y), list, `${n} album${n > 1 ? 's' : ''}, ${num(list.reduce((s, a) => s + a.photos, 0))} photos`);
      }
      let k = 0;
      for (const [id, el] of cards) {
        if (!el.isConnected) continue;
        if (!el.classList.contains('is-in')) { reveal.observe(el); continue; }
        if (!animate || still) continue;
        const f = first.get(id), l = el.getBoundingClientRect();
        if (f) {
          const dx = f.left - l.left, dy = f.top - l.top;
          if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 750, easing: OUT });
        } else {
          el.animate([{ opacity: 0, transform: 'translateY(24px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: k++ * 60, easing: OUT, fill: 'backwards' });
        }
      }
      const empty = !shown.length;
      document.getElementById('empty').hidden = !empty;
      if (empty) document.getElementById('emptyTitle').textContent = q ? `No albums match “${query.trim()}”` : 'No albums here yet';
    }

    // Filter tabs, with the white pill sliding under the chosen one
    const tabs = [...document.querySelectorAll('.tab')];
    const tabPill = document.querySelector('.tab-pill');
    // It only slides when a tab is chosen; when the row settles (first placement, the counts arriving, a resize, the
    // font) it moves straight to its tab instead of growing and gliding in on its own
    function placePill(slide = false) {
      const t = tabs.find((x) => x.getAttribute('aria-selected') === 'true');
      if (!slide) tabPill.style.transition = 'none';
      tabPill.style.width = `${t.offsetWidth}px`;
      tabPill.style.translate = `${t.offsetLeft}px 0`;
      if (!slide) { tabPill.offsetWidth; tabPill.style.transition = ''; }
    }
    // Filtering from far down the page brings the top of the archive back into view
    const toArchive = () => {
      const top = document.querySelector('.tools').parentElement.getBoundingClientRect().top + scrollY - 90;
      if (scrollY > top) scrollTo({ top, behavior: still ? 'auto' : 'smooth' });
    };
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => x.setAttribute('aria-selected', x === t));
      filter = t.dataset.filter; placePill(true); render(); toArchive();
      if (filter === 'liked') loadLiked();
    }));
    addEventListener('resize', () => placePill());
    // The tabs share the row's width, so a count changing size moves its neighbours: keep the pill on its tab
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => placePill()); tabs.forEach((t) => ro.observe(t)); }
    document.fonts?.ready.then(() => placePill());
    const search = document.getElementById('search');
    search.addEventListener('input', () => { query = search.value; render(); });
    document.getElementById('clearSearch').addEventListener('click', () => {
      search.value = query = ''; filter = 'all';
      tabs.forEach((x) => x.setAttribute('aria-selected', x.dataset.filter === 'all')); placePill(true); render(); search.focus();
    });

    // ---- Bookmarked: albums you saved, then every photo you've bookmarked ----
    // Saved albums are the same cards as above (moved here while Bookmarked is open). Bookmarked photos come from the
    // server in one list, so a photo from any album can be found again and opened where it belongs.
    const lkAlbums = document.getElementById('lkAlbums'), lkPhotos = document.getElementById('lkPhotos');
    const MARK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"/></svg>';
    // ---- Photo bookmarks: private, just for you (there are no likes any more; reactions do that job) ----
    //   POST /api/photos/:id/bookmark { bookmarked }  ->  { bookmarked }
    //   GET  /api/photos/bookmarked                   ->  { photos: [{ id, albumId, albumName, url, thumbnailUrl, by, bookmarkedAt }] }
    // A server that doesn't have these yet (404) keeps working through the old like endpoints.
    const isBookmarked = (p) => !!(p && (p.bookmarked ?? p.liked));
    const bookmarks = {
      async set(id, on) {
        const path = '/api/photos/' + encodeURIComponent(id);
        try { return !!(await momentoApi(path + '/bookmark', momentoJson('POST', { bookmarked: on }))).bookmarked; }
        catch (err) { if (err.status !== 404) throw err; }
        return !!(await momentoApi(path + '/like', momentoJson('POST', { liked: on }))).liked;
      },
      async list() {
        try { return (await momentoApi('/api/photos/bookmarked')).photos || []; }
        catch (err) { if (err.status !== 404) throw err; }
        return (await momentoApi('/api/photos/liked')).photos || [];
      },
    };
    let likedPhotos = null;   // null until the list has loaded
    const matchesQuery = (text) => { const q = query.trim().toLowerCase(); return !q || text.toLowerCase().includes(q); };
    function renderLiked() {
      const saved = kept().filter((a) => a.saved && matchesQuery(`${a.name} ${a.place || ''} ${a.group?.name || ''}`)).sort((x, y) => y.date.localeCompare(x.date));
      lkAlbums.replaceChildren(...saved.map((a) => {
        const el = cards.get(a.id);
        el.classList.remove('wide');
        if (!el.classList.contains('is-in')) reveal.observe(el);
        return el;
      }));
      document.getElementById('lkAlbumsBlock').hidden = !saved.length;
      document.getElementById('lkAlbumsMeta').textContent = `${plural(saved.length, 'album', 'albums')} you bookmarked.`;
      const photos = (likedPhotos || []).filter((p) => matchesQuery(p.albumName || ''));
      document.getElementById('lkPhotosBlock').hidden = !photos.length;
      document.getElementById('lkPhotosMeta').textContent = `${plural(photos.length, 'photo', 'photos')} you bookmarked, newest first. Only you can see these.`;
      lkPhotos.replaceChildren(...photos.map(likedItem));
      // Nothing to show: say how to fill it (but not while the photos are still on their way)
      const none = likedPhotos !== null && !saved.length && !photos.length;
      document.getElementById('lkEmpty').hidden = !none;
      if (none) {
        const q = query.trim();
        document.getElementById('lkEmptyTitle').textContent = q ? `Nothing bookmarked matches “${q}”` : 'Nothing bookmarked yet';
        document.getElementById('lkEmptyText').textContent = q ? 'Try another name, or clear the search.' : 'Bookmark a photo while you look at it full size, or save an album with its bookmark, and it shows up here.';
      }
    }
    function likedItem(p) {
      const el = document.createElement('div');
      el.className = 'lk-item';
      el.innerHTML = `
        <button class="lk-photo" type="button" aria-label="Open this photo in ${esc(p.albumName || 'its album')}">
          <img ${smallImg(p, '', '(max-width: 600px) 50vw, 240px')} alt="" loading="lazy" decoding="async">
          <span class="lk-cap"><b>${esc(p.albumName || 'Album')}</b>${p.by ? `<small>Photo by ${esc(p.by)}</small>` : ''}</span>
        </button>
        <button class="lk-heart" type="button" aria-label="Remove this photo’s bookmark" title="Remove bookmark">${MARK_ICON}</button>`;
      el.querySelector('.lk-photo').addEventListener('click', () => {
        if (!byId(p.albumId)) { Momento.toast('Couldn’t open the photo', 'Its album isn’t in your list any more.'); return; }
        openAlbum(p.albumId, '/photos/' + p.id);
      });
      el.querySelector('.lk-heart').addEventListener('click', () => unbookmark(p));
      return el;
    }
    async function loadLiked() {
      try { likedPhotos = await bookmarks.list(); }
      catch (err) { likedPhotos = likedPhotos || []; Momento.toast('Couldn’t load your bookmarked photos', err.message); }
      if (filter === 'liked') renderLiked();
    }
    async function unbookmark(p) {
      try { await bookmarks.set(p.id, false); }
      catch (err) { Momento.toast('That didn’t go through', err.message); return; }
      likedPhotos = (likedPhotos || []).filter((x) => x.id !== p.id);
      // If that album's photos are already loaded here, keep them in step
      const item = byId(p.albumId)?.photoItems?.find((x) => x.id === p.id);
      if (item) item.bookmarked = false;
      Momento.toast('Bookmark removed', p.albumName || '');
      renderLiked();
    }

    // Saving an album: the bookmark on its card, and the Save chip inside its window
    function paintSaveChip(a) {
      const chip = document.getElementById('albumSave');
      chip.setAttribute('aria-pressed', !!a.saved);
      chip.querySelector('span').textContent = a.saved ? 'Saved' : 'Save';
    }
    function paintSaved(a) {
      const on = !!a.saved, bookmark = cards.get(a.id)?.querySelector('.bookmark');
      if (bookmark) {
        bookmark.setAttribute('aria-pressed', on);
        bookmark.setAttribute('aria-label', `${on ? 'Remove' : 'Save'} ${a.name}`);
        bookmark.title = on ? 'Saved. Click to remove' : 'Save album';
      }
      if (M.a === a) paintSaveChip(a);
    }
    async function toggleSave(a) {
      const want = !a.saved;
      a.saved = want; paintSaved(a);
      try {
        const r = await momentoApi('/api/albums/' + encodeURIComponent(a.id) + '/save', momentoJson('POST', { saved: want }));
        a.saved = !!r.saved;
        Momento.toast(a.saved ? 'Album saved' : 'Removed from saved', a.saved ? `${a.name} is now under Bookmarked.` : a.name);
      } catch (err) { a.saved = !want; Momento.toast('Couldn’t save the album', err.message); }
      paintSaved(a);
      if (filter === 'liked') renderLiked();
    }
    document.getElementById('albumSave').addEventListener('click', () => { if (M.a) toggleSave(M.a); });

    const feedEl = document.getElementById('feed');
    const todoEl = document.getElementById('todo');

    // ---- Album window: every photo in a grid; tap one to see it full size, or Select to pick several ----
    const albumModal = document.getElementById('albumModal');
    const albumCard = albumModal.querySelector('.album-card');
    const thumbsEl = document.getElementById('thumbs');
    const albumFiles = document.getElementById('albumFiles');
    const albumRemove = document.getElementById('albumRemove');
    const M = { a: null, i: 0, closing: false, shareOpen: false };

    function showModal(m) {
      // The custom cursor can't draw above a modal, so the normal cursor comes back
      root.classList.remove('has-cursor', 'cursor-hover', 'cursor-drag');
      m.showModal();
      // A finger didn't choose the first button, so it shouldn't wear a focus ring
      if (!finePointer && m.contains(document.activeElement)) document.activeElement.blur();
      // The dimmed backdrop fades in rather than snapping on
      if (!still) try { m.animate({ opacity: [0, 1] }, { duration: 380, easing: 'ease-out', pseudoElement: '::backdrop' }); } catch (e) {}
    }
    // Closing a window: its card sinks and fades while the backdrop lifts, together, and only then
    // does it close, so nothing snaps away at the end. `extra` are animations to wait for too
    // Phones: the album, Recently deleted and Just added fill the screen, so they rise like a sheet from the
    // bottom edge and slide back down when closed (or when you pull them down by the header)
    const phoneSheet = matchMedia('(max-width: 600px)');
    const SHEET_IN = 'cubic-bezier(.32, .72, 0, 1)';
    function cardIn(card) {
      if (still) return;
      card.getAnimations().forEach((a) => a.cancel());
      if (phoneSheet.matches && card.classList.contains('album-card')) card.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 520, easing: SHEET_IN });
      else card.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: 440, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
    async function softClose(d, card = d.querySelector('.modal-card'), extra = []) {
      if (d._closing || !d.open) return;
      d._closing = true;
      if (!still) {
        const ease = 'cubic-bezier(.4, 0, .2, 1)';
        const jobs = [...extra];
        const from = card?.style.transform || 'none';
        if (card && phoneSheet.matches && card.classList.contains('album-card')) {
          // From wherever a pull left it, down and away; the rest of the way feels like it carries on
          const left = 1 - (card._pulled || 0) / (card.offsetHeight || innerHeight);
          jobs.push(card.animate([{ transform: from }, { transform: 'translateY(100%)' }], { duration: Math.max(180, 340 * left), easing: 'cubic-bezier(.3, 0, .8, .15)', fill: 'forwards' }).finished);
        } else if (card) jobs.push(card.animate([{ opacity: 1, transform: from }, { opacity: 0, transform: 'translateY(8px) scale(.975)' }], { duration: 260, easing: ease, fill: 'forwards' }).finished);
        try { jobs.push(d.animate({ opacity: [1, 0] }, { duration: 420, easing: ease, fill: 'forwards', pseudoElement: '::backdrop' }).finished); } catch (e) {}
        await Promise.all(jobs).catch(() => {});
      }
      d.close();
      d.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      if (card) { card.style.transform = ''; card._pulled = 0; }
      d._closing = false;
    }
    // Which photo the full-size viewer is on (or will open on). Moving while it's open flips the viewer too
    function show(i) {
      const total = M.a?.pics.length || 0;
      if (!total) return;
      M.i = (i + total) % total;
      if (viewer.open) vwLoad(true);
    }
    // Tapping a photo in the grid shows it full size, growing out of its tile
    // ---- Just the photos a notification is about ----
    // The grid keeps every tile (their numbers are the viewer's positions) and hides the rest; a bar above says
    // whose photos these are, with a way back to all of them. The viewer steps through only these (M.only).
    let pendingFocus = null;
    function clearFocus() {
      M.only = null;
      document.getElementById('abFocus')?.remove();
      thumbsEl.querySelectorAll('.ab-tile[hidden]').forEach((t) => { t.hidden = false; });
    }
    function showAllPhotos() { M.focus = null; clearFocus(); }
    function applyFocus(f) {
      clearFocus();
      const want = new Set(f.photos), tiles = [...thumbsEl.children], keep = tiles.filter((t) => want.has(t.dataset.id));
      if (!keep.length) {
        M.focus = null;
        document.getElementById('albumNote').textContent = 'Those photos aren’t in the album any more. Here’s everything else.';
        return;
      }
      tiles.forEach((t) => { t.hidden = !want.has(t.dataset.id); });
      M.only = keep.map((t) => +t.dataset.n);
      const bar = document.createElement('div');
      bar.className = 'ab-focus';
      bar.id = 'abFocus';
      const what = keep.length === 1 ? 'this photo' : `these ${keep.length} photos`;
      bar.innerHTML = `<p class="ab-focus-text">${f.by ? `<b></b> added ${what}` : `New: ${what}`}</p><button class="ab-focus-all" type="button">Show all photos</button>`;
      if (f.by) bar.querySelector('b').textContent = f.by;
      bar.querySelector('button').addEventListener('click', () => { showAllPhotos(); thumbsEl.querySelector('.ab-tile')?.focus({ preventScroll: true }); });
      thumbsEl.before(bar);
    }

    function openPhoto(n, fromEl) {
      if (!M.a?.pics.length) return;
      M.i = Math.max(0, Math.min(n, M.a.pics.length - 1));
      openViewer(fromEl);
    }
    let opening = 0;
    async function openAlbum(id, i = 0, fromImg = null, upload = false) {
      const request = ++opening;
      const a = byId(id);
      if (!a) return;
      try { await fetchAlbum(a); }
      catch (err) { Momento.toast('Could not open album', err.message); return; }
      if (request !== opening) return;
      // A photo can be named by its address (from the "Just added" list, or Bookmarked) instead of its position:
      // the album opens and that photo is shown full size
      let peek = -1;
      if (typeof i === 'string') {
        const pid = (i.match(/\/photos\/([^/?#]+)/) || [])[1];
        peek = (a.photoItems || []).findIndex((p) => p.id === pid);
        i = Math.max(0, peek);
      }
      M.a = a; M.i = i; M.shareOpen = false;
      // Seen: this album's notifications (new photos, reactions, joins) are marked read, and the bell updates
      momentoApi('/api/notifications/read', momentoJson('POST', { album: a.id }))
        .then((r) => { if (r?.marked) document.dispatchEvent(new CustomEvent('momento:notifications')); }, () => {});
      // Opened from a notification about new photos: just those (fillAlbum applies it)
      M.focus = pendingFocus?.album === id ? pendingFocus : null;
      pendingFocus = null;
      albumSel.stop(); closeMenu();
      document.getElementById('albumTitle').textContent = a.name;
      fillAlbum(a);
      document.getElementById('albumNote').textContent = '';
      if (!uploading) setUpload('off');
      if (upload && !canAdd(a)) document.getElementById('albumNote').textContent = noAddReason(a);
      else if (upload) {
        // Straight to the photo picker (browsers allow it shortly after a click); the hint covers the rest
        document.getElementById('albumNote').textContent = 'Choose Add photos below to upload.';
        try { albumFiles.click(); } catch {}
      }
      showModal(albumModal);
      syncAddress();
      albumModal.querySelector('.album-scroll').scrollTop = 0;
      paintMore();
      if (!still && !abMore.hidden) abMore.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 600, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' });
      if (!still) {
        const SOFT = 'cubic-bezier(.22, 1, .36, 1)';
        cardIn(albumCard);
        // The photos settle in just behind the window
        [...thumbsEl.children].slice(0, 24).forEach((t, n) => t.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: (phoneSheet.matches ? 200 : 120) + n * 14, easing: SOFT, fill: 'backwards' }));
      }
      if (peek >= 0) openPhoto(peek, thumbsEl.children[peek]?.querySelector('img'));
    }
    // ---- Staying put on reload: the address says which album (and which photo) is open ----
    // albums.html?album=<id>&photo=<id> reopens the same album and photo after a reload; closing them takes
    // them off the address again. (Inside another page's window the outer page keeps track instead)
    function syncAddress() {
      if (root.classList.contains('is-embed')) return;
      const u = new URL(location.href);
      const a = albumModal.open && M.a ? M.a : null;
      if (a) u.searchParams.set('album', a.id); else ['album', 'photos', 'by'].forEach((k) => u.searchParams.delete(k));
      const ph = a && viewer.open ? a.photoItems?.[M.i]?.id : null;
      if (ph) u.searchParams.set('photo', ph); else u.searchParams.delete('photo');
      if (u.href !== location.href) history.replaceState(history.state, '', u);
    }
    // Closing (X, Esc or a click on the page behind): the window and its backdrop fade out together
    async function closeAlbum() {
      if (M.closing || !albumModal.open) return;
      M.closing = true;
      await softClose(albumModal, albumCard);
    }
    albumModal.addEventListener('close', () => {
      syncAddress();
      albumCard.getAnimations().forEach((a) => a.cancel());
      albumSel.stop(); closeMenu(); closePulse();
      M.closing = false;
      if (useCursor) root.classList.add('has-cursor');
    });
    // Esc steps back one thing at a time: the menu, then Select, then the window itself
    albumModal.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (!pulseEl.hidden) closePulse(true);
      else if (!menuEl.hidden) closeMenu(true);
      else if (albumSel.on) albumSel.stop();
      else closeAlbum();
    });
    albumModal.addEventListener('pointerdown', (e) => { albumModal._downOutside = e.target === albumModal; }); albumModal.addEventListener('click', (e) => { if (e.target === albumModal && albumModal._downOutside) closeAlbum(); });
    albumModal.querySelector('[data-close]').addEventListener('click', closeAlbum);
    // Phones: pull the album down to close it, by its header, or by the photos once they're scrolled to the top
    function pullToClose(card, scroller, close, blocked = () => false) {
      let d = null;
      const begin = (y, fromScroll) => { if (!phoneSheet.matches || still || blocked()) return; d = { y, y0: y, t: performance.now(), dy: 0, fromScroll, on: !fromScroll }; };
      const move = (y, e) => {
        if (!d) return;
        const dy = y - d.y0;
        if (!d.on) {
          // From the photos: only once they're at the top and the finger moves down; otherwise it's a scroll
          if (scroller.scrollTop > 0 || dy < -4) { d = null; return; }
          if (dy < 8) return;
          d.on = true; d.y0 = y; card.getAnimations().forEach((a) => a.cancel());
          return;
        }
        if (e.cancelable) e.preventDefault();
        d.dy = Math.max(0, y - d.y0); d.v = (y - d.y) / Math.max(1, performance.now() - d.t); d.y = y; d.t = performance.now();
        card._pulled = d.dy;
        card.style.transform = `translateY(${d.dy}px)`;
      };
      const end = () => {
        if (!d) return;
        const { dy, v = 0, on } = d; d = null;
        if (!on) return;
        if (dy > 110 || (v > .55 && dy > 24)) { close(); return; }
        const from = card.style.transform;
        card.style.transform = ''; card._pulled = 0;
        if (from) card.animate([{ transform: from }, { transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      };
      const head = card.querySelector('.ab-head');
      for (const [el, fromScroll] of [[head, false], [scroller, true]]) {
        if (!el) continue;
        el.addEventListener('touchstart', (e) => { if (e.touches.length === 1 && !e.target.closest('button, input, a, .ab-menu, .ab-pulse')) begin(e.touches[0].clientY, fromScroll); else d = null; }, { passive: true });
        el.addEventListener('touchmove', (e) => { if (e.touches.length === 1) move(e.touches[0].clientY, e); else d = null; }, { passive: false });
        el.addEventListener('touchend', end); el.addEventListener('touchcancel', () => { if (d) { d.dy = 0; d.v = 0; } end(); });
      }
    }
    // "Scroll to see more photos": while there's a good deal more below and you haven't started scrolling
    const abMore = document.getElementById('abScrollHint'), abScroll = albumModal.querySelector('.album-scroll');
    let moreFrame = 0;
    function paintMore() {
      moreFrame = 0;
      const below = abScroll.scrollHeight - abScroll.clientHeight - abScroll.scrollTop;
      const room = abScroll.scrollHeight - abScroll.clientHeight > 160 && !albumCard.classList.contains('is-empty');
      abMore.hidden = !room;
      abMore.classList.toggle('is-gone', !room || abScroll.scrollTop > 60 || below < 120 || albumSel.on);
    }
    abScroll.addEventListener('scroll', () => { if (!moreFrame) moreFrame = requestAnimationFrame(paintMore); }, { passive: true });
    new ResizeObserver(() => { if (albumModal.open) paintMore(); }).observe(thumbsEl);
    albumModal.addEventListener('close', () => { abMore.hidden = true; });
    abMore.addEventListener('click', () => abScroll.scrollBy({ top: abScroll.clientHeight * .75, behavior: still ? 'auto' : 'smooth' }));
    pullToClose(albumCard, albumModal.querySelector('.album-scroll'), closeAlbum, () => albumSel.on || !menuEl.hidden || !pulseEl.hidden || M.closing);
    // Arrow keys move between photos in the grid
    thumbsEl.addEventListener('keydown', (e) => {
      const tile = e.target.closest('.ab-tile');
      if (!tile || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      const tiles = [...thumbsEl.querySelectorAll('.ab-tile')], at = tiles.indexOf(tile);
      const cols = getComputedStyle(thumbsEl).gridTemplateColumns.split(' ').length;
      const to = { ArrowLeft: at - 1, ArrowRight: at + 1, ArrowUp: at - cols, ArrowDown: at + cols, Home: 0, End: tiles.length - 1 }[e.key];
      if (!tiles[to]) return;
      e.preventDefault();
      tiles[to].focus();
    });
    // The photos of an album: tap to see one full size; Select (or a long press) picks several. One helper
    // does the picking for every grid, so the album and Recently deleted behave alike
    function makeSelect(grid, onChange) {
      const s = { on: false, ids: new Set(), anchor: null, open: null, down: null, drag: null, quiet: false };
      const tiles = () => [...grid.querySelectorAll('[data-id]')];
      const tileOf = (el) => { const t = el?.closest?.('[data-id]'); return t && grid.contains(t) ? t : null; };
      s.paint = () => {
        const have = new Set();
        for (const t of tiles()) {
          const on = s.ids.has(t.dataset.id);
          if (on) have.add(t.dataset.id);
          t.classList.toggle('is-picked', on);
          if (s.on) t.setAttribute('aria-pressed', on); else t.removeAttribute('aria-pressed');
        }
        s.ids = have;   // photos that have gone are forgotten
        grid.classList.toggle('is-selecting', s.on);
        onChange(s);
      };
      s.start = (id) => { s.on = true; if (id) { s.ids.add(id); s.anchor = id; } s.paint(); };
      s.stop = () => { if (!s.on && !s.ids.size) return; s.on = false; s.ids.clear(); s.anchor = null; s.paint(); };
      s.toggle = (id) => { s.ids.has(id) ? s.ids.delete(id) : s.ids.add(id); s.anchor = id; s.paint(); };
      s.all = () => { const all = tiles(); if (all.length && s.ids.size === all.length) s.ids.clear(); else all.forEach((t) => s.ids.add(t.dataset.id)); s.paint(); };
      const span = (a, b) => { const ids = tiles().map((t) => t.dataset.id), i = ids.indexOf(a), j = ids.indexOf(b); return i < 0 || j < 0 ? [] : ids.slice(Math.min(i, j), Math.max(i, j) + 1); };
      grid.addEventListener('click', (e) => {
        const t = tileOf(e.target);
        if (!t) return;
        if (s.quiet) { s.quiet = false; return; }   // the press that just started Select, or a drag, isn't a tap
        const id = t.dataset.id;
        if (!s.on) { s.open?.(t); return; }
        if (e.shiftKey && s.anchor) { span(s.anchor, id).forEach((x) => s.ids.add(x)); s.paint(); }
        else s.toggle(id);
      });
      grid.addEventListener('pointerdown', (e) => {
        s.quiet = false;
        const t = e.button > 0 ? null : tileOf(e.target);
        if (!t) return;
        const d = s.down = { id: t.dataset.id, x: e.clientX, y: e.clientY, moved: false, timer: 0 };
        // Touch: holding a photo starts Select with that photo picked
        if (e.pointerType !== 'mouse' && !s.on) d.timer = setTimeout(() => { if (s.down === d && !d.moved) { s.quiet = true; d.fresh = true; s.start(d.id); navigator.vibrate?.(10); } }, 450);
      });
      grid.addEventListener('pointermove', (e) => {
        const d = s.down;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) > 8) { d.moved = true; clearTimeout(d.timer); }
        if (!d.moved || !s.on) return;
        // Dragging across photos picks (or un-picks) a run of them. On touch, only a sideways drag does: up and down still scrolls
        if (!s.drag) {
          if (e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) { s.down = null; return; }
          s.drag = { from: d.id, mode: d.fresh || !s.ids.has(d.id), base: new Set(s.ids) };
        }
        const over = tileOf(document.elementFromPoint(e.clientX, e.clientY));
        if (!over) return;
        const next = new Set(s.drag.base);
        for (const id of span(s.drag.from, over.dataset.id)) s.drag.mode ? next.add(id) : next.delete(id);
        s.ids = next; s.anchor = over.dataset.id; s.paint();
        s.quiet = true;
      });
      const end = () => { if (s.down) clearTimeout(s.down.timer); s.down = null; s.drag = null; };
      grid.addEventListener('pointerup', end);
      grid.addEventListener('pointercancel', end);
      grid.addEventListener('contextmenu', (e) => { if (e.pointerType !== 'mouse' && tileOf(e.target)) e.preventDefault(); });
      return s;
    }
    const albumSel = makeSelect(thumbsEl, () => syncSelect());
    albumSel.open = (t) => openPhoto(+t.dataset.n, t.querySelector('img'));
    // What the window shows for an album: its line, thumbnails, an empty state, and whether it can be deleted or left
    // A short label for albums with event times: when photos can be added (the full sentence is the tooltip)
    function openLabel(a) {
      if (a.anytimeUploads) return '';
      if (!a.startsAt || !a.endsAt) return '';
      const t = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const dd = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const zone = a.zone?.radiusM ? ` · ${a.zone.radiusM >= 1000 ? +(a.zone.radiusM / 1000).toFixed(1) + ' km' : a.zone.radiusM + ' m'}` : '';
      if (a.status === 'live') return `Open until ${t(a.endsAt)}${zone}`;
      if (a.status === 'new' || a.status === 'upcoming') return `Opens ${dd(a.opensAt || a.startsAt)}, ${t(a.opensAt || a.startsAt)}${zone}`;
      return '';
    }
    function fillAlbum(a) {
      const empty = !a.pics.length;
      paintSaveChip(a);
      // One line for when, where and who hosts it; one for the numbers (and when photos can be added)
      document.getElementById('albumStats').textContent = a.photos
        ? [`${num(a.photos)} photos`, a.guests > 1 && `${a.guests} guests`, a.mine && `${num(a.mine)} yours`].filter(Boolean).join(' · ')
        : 'No photos yet';
      const isHost = a.role === 'host' && !!a.code;
      // The host's code, link and QR sit above the photos when asked for (Share album), and always while the album is empty
      document.getElementById('albumCode').hidden = !(isHost && (M.shareOpen || empty));
      document.getElementById('albumCodeText').textContent = isHost ? a.code : '';
      document.getElementById('abShare').hidden = !isHost;
      document.getElementById('abSettings').hidden = a.role !== 'host';
      document.getElementById('albumLink').hidden = !isHost;
      document.getElementById('albumQr').hidden = !isHost;
      document.getElementById('albumSub').textContent = [`${fmtDate(a.date)} ${a.date.slice(0, 4)}`, a.place, a.role === 'host' ? 'Hosted by you' : a.hostName ? `Hosted by ${a.hostName}` : '', a.group ? `Shared with ${a.group.name}` : ''].filter(Boolean).join(' · ');
      thumbsEl.innerHTML = (a.photoItems || []).map((p, n) => `<button class="ab-tile" type="button" data-n="${n}" data-id="${esc(p.id)}" aria-label="Photo ${n + 1}${p.by ? ', added by ' + esc(p.by) : ''}"><img ${smallImg(p, pic(p.url, 400, 400))} alt="" loading="lazy" decoding="async"><span class="ab-check" aria-hidden="true"></span></button>`).join('');
      albumSel.paint();
      if (M.focus && M.focus.album === a.id) applyFocus(M.focus); else clearFocus();
      document.getElementById('abSelect').hidden = empty;
      albumCard.classList.toggle('is-empty', empty);
      document.getElementById('albumEmpty').hidden = !empty;
      document.getElementById('albumEmptyText').textContent = a.role === 'host'
        ? (a.code ? `Share the code ${a.code} with guests so they can join, or add the first photos yourself.` : 'Add the first photos yourself, or share the album’s code with guests.')
        : 'Be the first to add photos from the night.';
      document.getElementById('albumDownload').hidden = !a.photos;
      paintPulse(a);
      document.getElementById('abBinHere').hidden = a.role !== 'host';
      document.getElementById('abBinCount').textContent = a.trashCount ? String(a.trashCount) : '';
      albumRemove.hidden = false;
      // Albums with event times take photos in their window; the host can add at any time
      const can = canAdd(a);
      // Still clickable when the album isn't taking photos, so a press can say why (see noAddReason)
      for (const id of ['albumAdd', 'albumCamera']) document.getElementById(id).setAttribute('aria-disabled', String(!can));
      const win = document.getElementById('albumWindow');
      win.textContent = openLabel(a);
      win.title = Momento.event?.windowText(a) || '';
      win.hidden = !win.textContent;
      // Photos you hid from your own view (only you stop seeing them) are listed under Recently deleted
      const unhide = document.getElementById('albumUnhide');
      unhide.hidden = !a.hiddenCount;
      unhide.querySelector('span').textContent = a.hiddenCount ? `Hidden by you (${a.hiddenCount})` : 'Hidden by you';
      albumRemove.textContent = a.role === 'host' ? 'Delete album' : 'Leave album';
      paintPhotoTools(a);   // sort and filter (below)
    }

    // ---- Sort and filter the photos in the open album ----
    // Done here on this device (nothing is sent): the order reorders the album's photo list itself, so the grid, the
    // full-size viewer, Select and downloads all follow it; the server's own order is kept on each photo (_o) to fall
    // back on. The filter hides the other tiles and the viewer steps through the shown ones only (M.only), like a
    // notification's "just these photos". The order is remembered on this device; the filter is per visit.
    const SORTS = [
      ['newest', 'Newest first'], ['oldest', 'Oldest first'], ['name', 'File name'], ['size', 'Largest first'],
      ['reactions', 'Most reactions'],
    ];   // (one person's photos: the Added by menu beside it)
    const FILTERS = [['all', 'All'], ['mine', 'Yours'], ['saved', 'Bookmarked'], ['reacted', 'With reactions']];
    const SORT_KEY = 'momento-photo-sort';
    let photoSort = 'newest', photoFilter = 'all', photoWho = '';
    try { const s = localStorage.getItem(SORT_KEY); if (SORTS.some(([k]) => k === s)) photoSort = s; } catch (e) {}
    const abTools = document.getElementById('abTools'), sortBtn = document.getElementById('abSortBtn');
    const sortMenu = document.getElementById('abSortMenu'), sortLabel = document.getElementById('abSortLabel');
    const filtersEl = document.getElementById('abFilters'), whoWrap = document.getElementById('abWhoWrap');
    const whoBtn = document.getElementById('abWhoBtn'), whoMenu = document.getElementById('abWhoMenu'), whoLabel = document.getElementById('abWhoLabel');
    const shownEl = document.getElementById('abShown');
    const photoReactions = (p) => Object.values(p.reactions || {}).reduce((t, n) => t + (+n || 0), 0);
    const fileNameOf = (p) => String(p.name || p.fileName || p.filename || '');
    const timeOf = (p) => Date.parse(p.at || p.addedAt || p.createdAt || '') || 0;
    // "File name" and "Largest first" only when the server sends names and sizes
    const sortable = (a, key) => key === 'name' ? (a.photoItems || []).some((p) => fileNameOf(p)) : key === 'size' ? (a.photoItems || []).some((p) => +p.size > 0) : true;
    const COMPARE = {
      newest: (x, y) => (timeOf(y.p) - timeOf(x.p)) || (x.p._o - y.p._o),
      oldest: (x, y) => (timeOf(x.p) - timeOf(y.p)) || (y.p._o - x.p._o),
      name: (x, y) => fileNameOf(x.p).localeCompare(fileNameOf(y.p), undefined, { numeric: true, sensitivity: 'base' }) || (x.p._o - y.p._o),
      size: (x, y) => ((+y.p.size || 0) - (+x.p.size || 0)) || (x.p._o - y.p._o),
      reactions: (x, y) => (photoReactions(y.p) - photoReactions(x.p)) || (x.p._o - y.p._o),
    };
    // Puts the album's photos (and their thumbnails, which go with them) in the chosen order
    function sortPhotos(a) {
      const items = a.photoItems || [];
      if (!items.length) return;
      items.forEach((p, i) => { if (p._o === undefined) p._o = i; });
      const key = sortable(a, photoSort) ? photoSort : 'newest';
      const rows = items.map((p, i) => ({ p, pic: a.pics[i] })).sort(COMPARE[key]);
      a.photoItems = rows.map((r) => r.p);
      a.pics = rows.map((r) => r.pic);
    }
    const matches = (p) => (photoFilter === 'all' || (photoFilter === 'mine' && p.mine) || (photoFilter === 'saved' && p.bookmarked) || (photoFilter === 'reacted' && photoReactions(p) > 0))
      && (!photoWho || String(p.by || '') === photoWho);
    const filtering = () => photoFilter !== 'all' || !!photoWho;
    function paintPhotoTools(a) {
      const items = a.photoItems || [];
      abTools.hidden = items.length < 2;
      const key = sortable(a, photoSort) ? photoSort : 'newest';
      sortLabel.textContent = SORTS.find(([k]) => k === key)[1];
      sortMenu.innerHTML = SORTS.filter(([k]) => sortable(a, k)).map(([k, label]) =>
        `<button class="ab-item" type="button" role="menuitemradio" aria-checked="${k === key}" data-sort="${k}">${label}</button>`).join('');
      filtersEl.innerHTML = FILTERS.map(([k, label]) => `<button class="ab-btn ab-chip" type="button" aria-pressed="${k === photoFilter}" data-filter="${k}">${label}</button>`).join('');
      // Added by: everyone who has photos here (you first), once there are at least two people
      const people = [...new Set(items.map((p) => String(p.by || '')).filter(Boolean))].sort((x, y) => (x === 'You' ? -1 : y === 'You' ? 1 : x.localeCompare(y)));
      if (photoWho && !people.includes(photoWho)) photoWho = '';
      whoLabel.textContent = photoWho || 'Everyone';
      whoBtn.classList.toggle('is-set', !!photoWho);
      whoMenu.innerHTML = ['', ...people].map((n) =>
        `<button class="ab-item" type="button" role="menuitemradio" aria-checked="${n === photoWho}" data-who="${esc(n)}">${n ? esc(n) : 'Everyone'}</button>`).join('');
      whoWrap.hidden = people.length < 2;
      applyPhotoFilter();
    }
    function applyPhotoFilter() {
      const a = M.a;
      if (!a) return;
      const tiles = [...thumbsEl.children];
      // A notification's "just these photos" view takes precedence until its Show all photos
      if (M.focus && M.focus.album === a.id && M.only && !filtering()) { shownEl.hidden = true; return; }
      if (!filtering()) {
        if (!(M.focus && M.focus.album === a.id)) { tiles.forEach((t) => { t.hidden = false; }); M.only = null; }
        shownEl.hidden = true;
        return;
      }
      const keep = [];
      (a.photoItems || []).forEach((p, n) => { const on = matches(p); if (tiles[n]) tiles[n].hidden = !on; if (on) keep.push(n); });
      M.only = keep;
      shownEl.hidden = false;
      shownEl.querySelector('span').textContent = keep.length
        ? `Showing ${plural(keep.length, 'photo', 'photos')} of ${num(a.photoItems.length)}`
        : 'No photos match these choices.';
    }
    function resetPhotoFilter() { photoFilter = 'all'; photoWho = ''; if (M.a) paintPhotoTools(M.a); }
    function setFilter(next) {
      if (M.focus) { M.focus = null; document.getElementById('abFocus')?.remove(); }
      if ('filter' in next) photoFilter = next.filter;
      if ('who' in next) photoWho = next.who;
      paintPhotoTools(M.a);
    }
    filtersEl.addEventListener('click', (e) => { const b = e.target.closest('[data-filter]'); if (b) setFilter({ filter: b.dataset.filter }); });
    document.getElementById('abShownClear').addEventListener('click', () => { resetPhotoFilter(); thumbsEl.querySelector('.ab-tile')?.focus({ preventScroll: true }); });
    // The Sort and Added by menus (the album window's own glass menu): the button opens it, a choice closes it; arrows,
    // Home and End move, Escape or a press outside closes it. Opening one closes the other
    const menus = [];
    function glassMenu(btn, menu, onPick) {
      const items = () => [...menu.querySelectorAll('.ab-item')];
      const setOpen = (open, focusChosen) => {
        if (open) menus.forEach((m) => { if (m.menu !== menu) m.setOpen(false); });
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
        if (open && focusChosen) (menu.querySelector('[aria-checked="true"]') || items()[0])?.focus();
      };
      btn.addEventListener('click', (e) => setOpen(menu.hidden, e.detail === 0));
      btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true, true); } });
      menu.addEventListener('click', (e) => {
        const b = e.target.closest('.ab-item');
        if (!b || !M.a) return;
        setOpen(false);
        btn.focus();
        onPick(b);
      });
      menu.addEventListener('keydown', (e) => {
        const list = items(), at = list.indexOf(document.activeElement);
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.focus(); }
        else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); list[(at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length]?.focus(); }
        else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); list[e.key === 'Home' ? 0 : list.length - 1]?.focus(); }
        else if (e.key === 'Tab') setOpen(false);
      });
      document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) setOpen(false); });
      menus.push({ menu, setOpen });
    }
    glassMenu(sortBtn, sortMenu, (b) => {
      photoSort = b.dataset.sort;
      try { localStorage.setItem(SORT_KEY, photoSort); } catch (err) {}
      sortPhotos(M.a);
      M.i = 0;
      fillAlbum(M.a);
      if (!still) [...thumbsEl.children].slice(0, 24).forEach((t, n) => t.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: n * 12, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' }));
    });
    glassMenu(whoBtn, whoMenu, (b) => setFilter({ who: b.dataset.who }));

    const canAdd = (a) => !!a?.open;
    // Why photos can't be added right now, in words
    function noAddReason(a) {
      if (!a) return '';
      const at = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      const soon = a.status === 'new' || a.status === 'upcoming';
      if (soon && (a.opensAt || a.startsAt)) return `Photos can be added from ${at(a.opensAt || a.startsAt)}.`;
      if (soon) return 'Photos can be added once the event starts.';
      return 'This album has closed to new photos. You can still look at it and download everything.';
    }
    function tryAdd() {
      if (uploading) return false;
      if (canAdd(M.a)) return true;
      document.getElementById('albumNote').textContent = noAddReason(M.a);
      return false;
    }
    document.getElementById('albumAdd').addEventListener('click', () => { if (tryAdd()) albumFiles.click(); });
    // Momento's own camera: the photos go straight into the upload, never into the device's gallery
    document.getElementById('albumCamera').addEventListener('click', async () => {
      if (!M.a || !Momento.event || !tryAdd()) return;
      const files = await Momento.event.camera();
      if (files.length) uploadFiles(files);
    });
    // fetch can't report upload progress, so photos go up with XMLHttpRequest (same cookie, same errors)
    function sendWithProgress(path, body, onProgress, headers = {}) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', window.MOMENTO_API + path);
        for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
        xhr.withCredentials = true;
        xhr.responseType = 'json';
        xhr.upload.addEventListener('progress', (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); });
        xhr.upload.addEventListener('load', () => onProgress(1));
        xhr.addEventListener('load', () => {
          const data = xhr.response || {};
          if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
          const err = new Error(data.error || 'The upload failed. Please try again.');
          err.status = xhr.status; err.code = data.code; err.data = data;
          reject(err);
        });
        xhr.addEventListener('error', () => reject(new Error('The connection dropped during the upload.')));
        xhr.addEventListener('abort', () => reject(new Error('The upload was cancelled.')));
        xhr.send(body);
      });
    }
    const uploadEl = document.getElementById('upload'), uploadLabel = document.getElementById('uploadLabel');
    const uploadPct = document.getElementById('uploadPct'), uploadTrack = document.getElementById('uploadTrack'), uploadFill = document.getElementById('uploadFill');
    let uploadHide = 0;
    function setUpload(state, p = 0, label = '') {
      clearTimeout(uploadHide);
      uploadEl.hidden = state === 'off';
      uploadEl.classList.toggle('is-processing', state === 'processing');
      uploadEl.classList.toggle('is-failed', state === 'failed');
      const pct = Math.round(p * 100);
      uploadFill.style.transform = `scaleX(${p})`;
      uploadPct.textContent = state === 'processing' ? '' : `${pct}%`;
      uploadTrack.setAttribute('aria-valuenow', pct);
      if (label) uploadLabel.textContent = label;
    }
    // Does this photo carry a GPS location? Reads the start of the file and looks for an Exif (TIFF) block
    // whose first directory points to a non-empty GPS directory. Works for JPEG, HEIC, PNG and WebP.
    async function hasGps(file) {
      try {
        const buf = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
        const dv = new DataView(buf.buffer);
        for (let i = 0; i + 8 < buf.length; i++) {
          const le = buf[i] === 0x49 && buf[i + 1] === 0x49 && buf[i + 2] === 0x2A && buf[i + 3] === 0;
          const be = buf[i] === 0x4D && buf[i + 1] === 0x4D && buf[i + 2] === 0 && buf[i + 3] === 0x2A;
          if (!le && !be) continue;
          const u16 = (o) => dv.getUint16(o, le), u32 = (o) => dv.getUint32(o, le);
          const ifd = i + u32(i + 4);
          if (ifd + 2 > buf.length) continue;
          const n = u16(ifd);
          if (!n || n > 500 || ifd + 2 + n * 12 > buf.length) continue;
          for (let e = 0; e < n; e++) {
            const at = ifd + 2 + e * 12;
            if (u16(at) !== 0x8825) continue;
            const gps = i + u32(at + 8);
            return gps + 2 > buf.length || u16(gps) > 0;   // past what was read: assume it has one
          }
          return false;
        }
      } catch (e) {}
      return false;
    }
    // ---- Upload limits: up to 50 MB a photo; camera RAW files (much bigger by nature) only have a high safety
    // ceiling. The server says its numbers in /api/config; these are the same, until that answers ----
    const RAW_EXTS = ['3fr', 'arw', 'cr2', 'cr3', 'crw', 'dcr', 'dng', 'erf', 'fff', 'iiq', 'kdc', 'mef', 'mos', 'mrw', 'nef', 'nrw', 'orf', 'pef', 'raf', 'raw', 'rw2', 'rwl', 'sr2', 'srf', 'srw', 'x3f'];
    let LIMITS = { maxPhotoMB: 50, maxRawMB: 300 };
    momentoApi('/api/config').then((c) => {
      const u = c?.uploads;
      if (u && Number(u.maxPhotoMB) > 0) LIMITS = { maxPhotoMB: Number(u.maxPhotoMB), maxRawMB: Number(u.maxRawMB) || LIMITS.maxRawMB };
    }, () => {});
    const isRawFile = (f) => RAW_EXTS.includes(String(f?.name || '').split('.').pop().toLowerCase());
    Momento.isRawFile = isRawFile;
    Momento.uploadLimits = () => LIMITS;
    // The photo picker shows every format Momento takes, named as well as by type: RAW files and (on many computers)
    // HEIC/HEIF, AVIF and JPEG XL have no image/ type, so they'd be greyed out. On a phone it still opens the gallery.
    const PHOTO_EXTS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'avif', 'gif', 'tif', 'tiff', 'jxl', 'bmp'];
    albumFiles.accept = 'image/*,' + [...PHOTO_EXTS, ...RAW_EXTS].map((e) => '.' + e).join(',');

    let uploading = false;
    albumFiles.addEventListener('change', () => { const files = [...albumFiles.files]; albumFiles.value = ''; uploadFiles(files); });
    // Any number of photos: sent as small uploads (up to 6 photos or ~48 MB each), three at a time side by
    // side, so a big selection goes up quickly and one problem photo (too big, unreadable) never stops the rest
    async function uploadFiles(files) {
      const a = M.a;
      if (!a || !files.length || uploading) return;
      const note = document.getElementById('albumNote');
      const MB = 1048576;
      const limitOf = (f) => (isRawFile(f) ? LIMITS.maxRawMB : LIMITS.maxPhotoMB) * MB;
      const left = files.filter((f) => f.size > limitOf(f));
      files = files.filter((f) => f.size <= limitOf(f));
      const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      const listNames = (names) => names.length <= 3 ? names.join(', ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
      const bigLine = (names) => `${listNames(names)} ${names.length === 1 ? 'is' : 'are'} over ${LIMITS.maxPhotoMB} MB, so ${names.length === 1 ? 'it was' : 'they were'} left out (the limit is ${LIMITS.maxPhotoMB} MB a photo; camera RAW files can be bigger).`;
      if (!files.length) { note.textContent = bigLine(left.map((f) => f.name)); return; }
      // Ask first (and get the guest's location when the album has a zone): assets/event.js
      const ok = Momento.event ? await Momento.event.confirmUpload(a, files) : { location: '' };
      if (!ok || M.a !== a || uploading) return;
      if (ok.files) files = ok.files;   // (any left out in the confirmation stay out)
      if (!files.length) return;
      uploading = true;
      const add = document.getElementById('albumAdd'); add.disabled = true; document.getElementById('albumCamera').disabled = true;
      note.textContent = left.length ? bigLine(left.map((f) => f.name)) : '';
      const count = plural(files.length, 'photo', 'photos');
      const total = files.reduce((t, f) => t + f.size, 0) || 1;
      const mb = (b) => (b / MB).toFixed(b < 10 * MB ? 1 : 0) + ' MB';
      setUpload('sending', 0, `Uploading ${count}`);
      uploadEl.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
      // Checked alongside the upload, so the note only mentions location when a photo had one
      let hadGps = false;
      const gpsCheck = Promise.all(files.map(hasGps)).then((r) => { hadGps = r.some(Boolean); });
      // Into small uploads
      const batches = [];
      for (let cur = [], bytes = 0, i = 0; i < files.length; i++) {
        const f = files[i];
        if (cur.length && (cur.length >= 6 || bytes + f.size > 48 * MB)) { batches.push(cur); cur = []; bytes = 0; }
        cur.push(f); bytes += f.size;
        if (i === files.length - 1) batches.push(cur);
      }
      const sizeOf = (b) => b.reduce((t, f) => t + f.size, 0);
      const sent = batches.map(() => 0);
      const r = { added: 0, queued: 0, dupes: 0, blocked: 0, unsure: 0, explicit: 0, removed: 0, tooBig: [], failed: [], errors: [] };
      let stop = false, lastRefresh = 0;
      const paint = () => {
        const done = sent.reduce((t, n) => t + n, 0), p = Math.min(1, done / total);
        if (p >= 1) setUpload('processing', 1, hadGps ? `Finishing ${count}, removing location data…` : `Finishing ${count}…`);
        else setUpload('sending', p, `Uploading ${count}, ${mb(total * p)} of ${mb(total)}`);
      };
      const headers = ok.location ? { 'X-Momento-Location': ok.location } : {};
      const wait = (ms) => new Promise((res) => setTimeout(res, ms));
      async function sendBatch(b, k) {
        for (let attempt = 0; !stop; attempt++) {
          const form = new FormData();
          b.forEach((file) => form.append('photos', file));
          try {
            const d = await sendWithProgress('/api/albums/' + a.id + '/photos', form, (p) => { sent[k] = sizeOf(b) * Math.min(1, p); paint(); }, headers);
            r.added += d.photos?.length || 0; r.dupes += d.skipped || 0; r.blocked += d.blocked || 0; r.removed += d.banned || 0;
            r.queued += (d.checks || []).filter((c) => ['checking', 'publish'].includes(c.state)).length;
            for (const c of d.checks || []) if (c.state === 'rejected') { if (c.explicit) r.explicit++; else r.unsure++; }
            r.tooBig.push(...(d.tooBig || [])); r.failed.push(...(d.failed || []));
            sent[k] = sizeOf(b); paint();
            // The photos show up in the album while the rest are still going (not while one is open full size)
            if (!viewer.open && Date.now() - lastRefresh > 2000) { lastRefresh = Date.now(); fetchAlbum(a).then(() => { if (!viewer.open) photosChanged(a, 0); }, () => {}); }
            return;
          } catch (err) {
            sent[k] = 0; paint();
            // Busy for a moment, or the connection dropped: tried again, a little later each time
            const again = attempt < 3 && (!err.status || err.status >= 500 || (err.status === 429 && err.code === 'upload-busy'));
            if (again) { await wait(700 * 2 ** attempt); continue; }
            sent[k] = sizeOf(b); paint();
            if (err.code === 'too-big') r.tooBig.push(...(err.data?.tooBig || b.map((f) => f.name)));
            else if (err.code === 'unreadable') { r.failed.push(...(err.data?.failed || b.map((f) => f.name))); r.tooBig.push(...(err.data?.tooBig || [])); }
            else if (err.code === 'nsfw') r.blocked += err.data?.decisionIds?.length || b.length;
            else if (err.code === 'removed-content') r.removed += b.length;
            else {
              r.errors.push(err.message);
              // The album closed, or this account may not add photos: no point sending the rest
              if (err.status === 403 || err.status === 401 || err.status === 404 || err.status === 429) stop = true;
            }
            return;
          }
        }
      }
      try {
        let next = 0;
        await Promise.all([0, 1, 2].map(async () => { while (!stop && next < batches.length) { const k = next++; await sendBatch(batches[k], k); } }));
        const lines = [];
        if (left.length || r.tooBig.length) lines.push(bigLine([...left.map((f) => f.name), ...r.tooBig]));
        if (r.failed.length) lines.push(`${listNames(r.failed)} couldn’t be read. Try exporting ${r.failed.length === 1 ? 'it' : 'them'} as JPEG.`);
        if (r.dupes) lines.push(`${plural(r.dupes, 'photo was', 'photos were')} already in the album.`);
        if (r.unsure) lines.push(`${plural(r.unsure, 'photo needs', 'photos need')} a quick check by our team before ${r.unsure === 1 ? 'it appears' : 'they appear'}. Only you can see ${r.unsure === 1 ? 'it' : 'them'} for now: press Request review below.`);
        if (r.explicit) lines.push(`${plural(r.explicit, 'photo was', 'photos were')} declined: ${r.explicit === 1 ? 'it looks' : 'they look'} like ${r.explicit === 1 ? 'it contains' : 'they contain'} nudity, which isn’t allowed on Momento.`);
        if (r.blocked && !r.unsure && !r.explicit) lines.push(`${plural(r.blocked, 'photo was', 'photos were')} declined by the automatic check.`);
        if (r.removed) lines.push(`${plural(r.removed, 'photo was', 'photos were')} removed from Momento before and can’t be added again.`);
        if (r.errors.length) lines.push(r.errors[0]);
        if (r.queued) setUpload('done', 1, 'Upload received. You can keep using Momento.');
        else if (r.added) setUpload('done', 1, `${plural(r.added, 'photo', 'photos')} uploaded`);
        else if (r.unsure) { setUpload('done', 1, r.unsure === 1 ? 'Uploaded: waiting for a review' : 'Uploaded: waiting for review'); uploadPct.textContent = ''; }
        else { setUpload('failed', 1, r.explicit ? 'Not added' : 'Nothing was uploaded'); uploadPct.textContent = ''; }
        await loadAlbums();
        await fetchAlbum(a);
        photosChanged(a, 0);
        await gpsCheck;
        if (hadGps && r.added) lines.push(r.added === 1 ? 'Location data was removed from this photo.' : 'Location data was removed from these photos.');
        note.textContent = lines.join(' ');
        if (r.added || r.queued || r.unsure) uploadHide = setTimeout(() => setUpload('off'), 2500);
      } catch (err) {
        setUpload('failed', 1, 'Upload didn’t finish');
        uploadPct.textContent = '';
        note.textContent = err.message + ' Refresh the album before retrying; some photos may have uploaded.';
        try { await fetchAlbum(a); photosChanged(a, 0); } catch {}
      } finally { uploading = false; add.disabled = false; document.getElementById("albumCamera").disabled = false; }
    }
    // A link to share: hosts get a join link (it carries the album code); guests get a link back to the album
    const albumLinkFor = (a) => {
      const url = new URL('albums', location.href);
      url.search = ''; url.hash = '';
      url.searchParams.set(a.code ? 'join' : 'album', a.code || a.id);
      return url.href;
    };
    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true; } catch {}
      const ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
      albumModal.append(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch {}
      ta.remove();
      return ok;
    }
    document.getElementById('albumCodeCopy').addEventListener('click', async (e) => {
      const a = M.a, b = e.currentTarget;
      if (!a?.code) return;
      // The button is an icon, so the answer comes as a toast
      Momento.toast(await copyText(a.code) ? 'Code copied' : 'Copy failed', a.code);
    });
    document.getElementById('albumLink').addEventListener('click', async () => {
      const a = M.a;
      if (!a || a.role !== 'host' || !a.code) return;
      // The share link (https://api.hexarch.org/s/CODE), so chat apps show the album's own preview card
      const link = Momento.inviteLink?.(a.code) || albumLinkFor(a);
      if (await copyText(link)) Momento.toast('Album link copied', a.code ? `Anyone with the link can join ${a.name} with the code ${a.code}.` : `People already in ${a.name} can open it with this link.`);
      else document.getElementById('albumNote').textContent = 'Copy this link: ' + link;
    });
    // After photos are added, deleted or brought back: redraw the window (if it shows this album), its card and the totals
    function photosChanged(a, at) {
      if (albumModal.open && M.a === a) {
        fillAlbum(a);
        if (a.pics.length) show(Math.max(0, Math.min(at, a.pics.length - 1)));   // (flips the full-size photo on to the next one, too)
        else if (viewer.open) closeViewer();
      }
      refreshCard(a);
      render(false); sumUp(false); renderLive();
    }
    const afterPhotos = async (a, at) => { await loadAlbums(); await fetchAlbum(a); photosChanged(a, at); };

    // ---- Select: pick photos, then download, hide or delete them together ----
    const abHead = document.getElementById('abHead'), abSelHead = document.getElementById('abSelHead');
    const abBar = document.getElementById('abBar'), abSelBar = document.getElementById('abSelBar');
    const abCount = document.getElementById('abCount'), abAll = document.getElementById('abAll');
    const abDl = document.getElementById('abDl'), abHide = document.getElementById('abHide'), abDel = document.getElementById('abDel');
    // The host can delete any photo in their album; everyone can delete the photos they added. Other people's
    // photos can be hidden from your own view
    const canDel = (a, p) => a?.role === 'host' || !!p?.mine;
    const canHide = (a, p) => !p.mine;
    const picked = () => (M.a?.photoItems || []).filter((p) => albumSel.ids.has(p.id));
    function syncSelect() {
      const on = albumSel.on, wasOn = !abSelHead.hidden;
      abHead.hidden = on; abSelHead.hidden = !on; abBar.hidden = on; abSelBar.hidden = !on;
      albumCard.classList.toggle('is-selecting', on);
      // Selecting works on the whole album, so photos hidden by a notification's filter come back first
      // (nothing can be picked, downloaded or deleted without being seen)
      if (on && (M.only || filtering())) { if (filtering()) resetPhotoFilter(); showAllPhotos(); }
      const items = picked(), n = items.length, total = M.a?.photoItems?.length || 0;
      abCount.textContent = n ? `${plural(n, 'photo', 'photos')} selected` : 'Select photos';
      abAll.textContent = n && n === total ? 'Deselect all' : 'Select all';
      const deletable = items.filter((p) => canDel(M.a, p)).length;
      abDel.hidden = M.a?.role !== 'host' && !(M.a?.photoItems || []).some((p) => p.mine);
      abDl.disabled = !n;
      abDel.disabled = !deletable;
      const hideable = items.filter((p) => canHide(M.a, p)).length;
      abHide.disabled = !hideable;
      abHide.querySelector('span').textContent = hideable && hideable < n ? `Hide ${hideable}` : 'Hide';
      // The header swaps while selecting, so keep focus on something that's still there
      if (on && !wasOn && albumModal.open) abCancel.focus({ preventScroll: true });
    }
    const abCancel = document.getElementById('abCancel');
    document.getElementById('abSelect').addEventListener('click', () => albumSel.start());
    abCancel.addEventListener('click', () => { albumSel.stop(); document.getElementById('abSelect').focus({ preventScroll: true }); });
    abAll.addEventListener('click', () => albumSel.all());
    abDel.addEventListener('click', () => binPhotos(picked(), abDel));
    abHide.addEventListener('click', () => hidePhotos(picked(), abHide));
    abDl.addEventListener('click', async () => {
      const items = picked();
      if (!items.length) return;
      if (items.length > 10 && !await Momento.confirm({ from: abDl, title: `Download ${items.length} photos?`, body: 'Your browser may ask you to allow several downloads.', ok: 'Download', danger: false })) return;
      albumSel.stop();
      downloadPhotos(items);
    });
    // One photo after another, saved as files without leaving the page
    async function downloadPhotos(items) {
      for (const p of items) {
        const url = p.downloadUrl || window.MOMENTO_API + '/api/photos/' + p.id + '/download';
        try {
          const own = url.startsWith('/') || (window.MOMENTO_API && url.startsWith(window.MOMENTO_API));
          const r = await fetch(url, own ? { credentials: 'include' } : {});
          if (!r.ok) throw new Error('download failed');
          const blob = await r.blob(), link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = `${p.id}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
          document.body.append(link); link.click(); link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        } catch (err) { window.open(url, '_blank', 'noopener'); }
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    // Hide (other people's photos, from your own view) and delete (your own, or any as the host). Both can be undone
    async function hidePhotos(items, from) {
      const a = M.a, others = items.filter((p) => canHide(a, p));
      if (!a || !others.length) return false;
      const n = others.length, at = M.i;
      if (!await Momento.confirm({ from, title: n === 1 ? 'Hide this photo?' : `Hide ${n} photos?`, body: 'Only you stop seeing them. Everyone else in the album still does. You can show them again from Recently deleted.', ok: 'Hide', danger: false })) return false;
      try { await momentoApi('/api/albums/' + a.id + '/hidden', momentoJson('POST', { photoIds: others.map((p) => p.id), hidden: true })); }
      catch (err) { Momento.toast('Couldn’t hide', err.message); return false; }
      albumSel.stop();
      try { await afterPhotos(a, at); } catch (err) { Momento.toast('Couldn’t refresh the album', err.message); }
      Momento.toast(n === 1 ? 'Photo hidden' : `${n} photos hidden`, 'Only you stop seeing it.', { action: { label: 'Undo', run: () => undoPhotos(a, [], others) } });
      return true;
    }
    async function binPhotos(items, from) {
      const a = M.a;
      items = items.filter((p) => canDel(a, p));   // the host deletes any; others only their own
      if (!a || !items.length) return false;
      const n = items.length, at = M.i;
      if (!await Momento.confirm({ from, title: n === 1 ? 'Delete this photo?' : `Delete ${n} photos?`, body: 'They stay in Recently deleted for 30 days, then they’re deleted for good. Everyone in the album stops seeing them.', ok: 'Delete' })) return false;
      try { await momentoApi('/api/trash', momentoJson('POST', { photoIds: items.map((p) => p.id) })); }
      catch (err) { Momento.toast('Couldn’t delete', err.message); return false; }
      albumSel.stop();
      try { await afterPhotos(a, at); } catch (err) { Momento.toast('Couldn’t refresh the album', err.message); }
      Momento.toast(n === 1 ? 'Photo deleted' : `${n} photos deleted`, 'Kept in Recently deleted for 30 days.', { danger: true, action: { label: 'Undo', run: () => undoPhotos(a, items, []) } });
      return true;
    }
    async function undoPhotos(a, del, others) {
      try {
        if (del.length) await momentoApi('/api/trash/restore', momentoJson('POST', { photoIds: del.map((p) => p.id) }));
        if (others.length) await momentoApi('/api/albums/' + a.id + '/hidden', momentoJson('POST', { photoIds: others.map((p) => p.id), hidden: false }));
        await afterPhotos(a, M.i);
        Momento.toast('Photos are back', a.name);
      } catch (err) { Momento.toast('Couldn’t undo', err.message); }
    }

    // ---- The ⋯ menu: share, download everything, Recently deleted, hidden photos, delete or leave the album ----
    const menuEl = document.getElementById('abMenu'), menuBtn = document.getElementById('abMore');
    function closeMenu(refocus) {
      if (menuEl.hidden) return;
      menuEl.hidden = true; menuBtn.setAttribute('aria-expanded', 'false');
      if (refocus) menuBtn.focus({ preventScroll: true });
    }
    function openMenu() {
      closePulse();
      menuEl.hidden = false; menuBtn.setAttribute('aria-expanded', 'true');
      if (!still) menuEl.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      menuEl.querySelector('.ab-item:not([hidden])')?.focus({ preventScroll: true });
    }
    menuBtn.addEventListener('click', () => (menuEl.hidden ? openMenu() : closeMenu(true)));
    menuEl.addEventListener('click', (e) => { if (e.target.closest('.ab-item')) closeMenu(); });
    menuEl.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') { closeMenu(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...menuEl.querySelectorAll('.ab-item:not([hidden])')], at = items.indexOf(document.activeElement);
      items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    });
    document.addEventListener('pointerdown', (e) => { if (!menuEl.hidden && !menuEl.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); }, true);
    document.getElementById('abSettings').addEventListener('click', () => { if (M.a) Momento.albumSettings?.open(M.a.id, menuBtn); });
    document.getElementById('abShare').addEventListener('click', () => {
      const code = document.getElementById('albumCode');
      M.shareOpen = code.hidden;
      code.hidden = !M.shareOpen && !!M.a?.pics.length;
      if (!code.hidden) albumModal.querySelector('.album-scroll').scrollTop = 0;
    });
    document.getElementById('abBinHere').addEventListener('click', () => openBin({ album: M.a?.id, tab: 'deleted' }));
    document.getElementById('albumUnhide').addEventListener('click', () => openBin({ album: M.a?.id, tab: 'hidden' }));
    document.getElementById('albumDownload').addEventListener('click', () => {
      if (M.a) location.href = window.MOMENTO_API + '/api/albums/' + M.a.id + '/download';
    });
    albumRemove.addEventListener('click', () => Momento.removeAlbum(M.a, albumRemove));
    // ---- Likes and emoji reactions ----
    // One reaction per person per photo: pick another to switch, pick yours again to take it back
    const pbTally = document.getElementById('pbTally');
    // Every emoji you can react with (assets/emoji.js), the original twelve first; just those twelve if it didn't load
    const REACT_NAME = window.MomentoEmoji
      ? Object.fromEntries(MomentoEmoji.all.map((it) => [it.e, it.name]))
      : { '😍': 'Love it', '😂': 'Haha', '🔥': 'Fire', '👏': 'Applause', '🥹': 'So sweet', '😮': 'Wow', '🎉': 'Celebrate', '🥳': 'Party', '❤️': 'Heart', '🙌': 'Hooray', '✨': 'Sparkles', '🤩': 'Starstruck' };
    const REACTIONS = Object.keys(REACT_NAME);
    // Any single emoji is a reaction, also one typed or pasted from the phone's emoji keyboard (the server checks
    // the same way); the named ones come from assets/emoji.js
    const graphemes = window.Intl?.Segmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
    const isEmoji = (e) => typeof e === 'string' && e.length > 0 && e.length <= 32
      && (!graphemes || [...graphemes.segment(e)].length === 1)
      && /\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3/u.test(e);
    const nameOf = (e) => REACT_NAME[e] || e;
    // When someone reacted: "just now", "5 min ago", "3 h ago", "Yesterday, 21:04", "12 Nov, 21:04"
    const reactedWhen = (iso) => {
      const t = Date.parse(iso);
      if (!Number.isFinite(t)) return '';
      const mins = Math.round((Date.now() - t) / 60000), d = new Date(t);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins} min ago`;
      if (mins < 6 * 60) return `${Math.round(mins / 60)} h ago`;
      const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const day = new Date(); day.setHours(0, 0, 0, 0);
      if (t >= day.getTime()) return `Today, ${time}`;
      if (t >= day.getTime() - 86400000) return `Yesterday, ${time}`;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== new Date().getFullYear() && { year: 'numeric' }) }) + ', ' + time;
    };
    const VW_SMILE = document.getElementById('vwFace').innerHTML;
    const reactTotal = (p) => Object.values(p.reactions || {}).reduce((s, n) => s + n, 0);
    let openPick = null, reactBusy = false, dismissedAt = 0;
    const justDismissed = () => performance.now() - dismissedAt < 450;
    const current = () => M.a?.photoItems?.[M.i];
    // Once the album is live its cover is the photo with the most likes plus reactions (the newest wins a tie),
    // worked out here too so the badge moves the moment someone likes or reacts. None while the host's own
    // cover is showing: always while upcoming, and from then on if they chose to keep it
    const scoreOf = (p) => (p.likes || 0) + reactTotal(p);
    const coverOf = (a) => {
      if (!a || (a.hasHostCover && (a.keepHostCover || a.status === 'new'))) return null;
      return (a.photoItems || []).reduce((best, p) => (scoreOf(p) > (best ? scoreOf(best) : 0) ? p : best), null);
    };
    function renderSocial() {
      const p = current();
      if (!p) return;
      const mine = p.reaction || null;
      // Everyone's reactions, most popular first; tap one to add (or take back) yours
      const counts = Object.entries(p.reactions || {}).filter(([e, n]) => n > 0 && isEmoji(e)).sort((x, y) => y[1] - x[1] || REACTIONS.indexOf(x[0]) - REACTIONS.indexOf(y[0]));
      pbTally.replaceChildren(...counts.map(([e, n]) => {
        const chip = document.createElement('button');
        chip.type = 'button'; chip.className = 'pb-chip'; chip.dataset.e = e;
        chip.setAttribute('aria-pressed', e === mine);
        chip.setAttribute('aria-haspopup', 'dialog');
        chip.setAttribute('aria-expanded', openPick?.el === pbWho && who.tab === e);
        chip.setAttribute('aria-label', `${nameOf(e)}, ${plural(n, 'reaction', 'reactions')}${e === mine ? ', including yours' : ''}. See who reacted`);
        chip.innerHTML = '<span class="e" aria-hidden="true"></span><span></span>';
        chip.firstChild.textContent = e; chip.lastChild.textContent = num(n);
        return chip;
      }));
      if (openPick && openPick.for !== p.id) closePicker(false);
      else if (openPick?.el === pbWho) { openPick.trigger = pbTally.querySelector(`.pb-chip[data-e="${CSS.escape(who.tab)}"]`) || document.getElementById('vwReact'); paintWho(); }
      const cover = coverOf(M.a);
      document.getElementById('pbCover').hidden = !(cover && cover.id === p.id);
      if (viewer.open) vwPaint();
    }
    // Bookmark: keep a photo for yourself (it shows on the Bookmarked tab). Private, so no count
    let markBusy = false;
    async function setBookmark(want) {
      const p = current();
      if (!p || markBusy || isBookmarked(p) === want) return;
      markBusy = true;
      const before = p.bookmarked;
      p.bookmarked = want;
      vwPaint();
      if (want && !still) vwMark.querySelector('svg').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35) translateY(-2px)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
      try {
        p.bookmarked = await bookmarks.set(p.id, want);
        Momento.toast(p.bookmarked ? 'Photo bookmarked' : 'Bookmark removed', p.bookmarked ? 'Find it on the Bookmarked tab in My albums.' : '');
        likedPhotos = null;   // the Bookmarked tab fetches its list again next time
      } catch (err) { p.bookmarked = before; Momento.toast('That didn’t go through', err.message); }
      finally { markBusy = false; if (current() === p) vwPaint(); }
    }

    // ---- Full size ----
    const viewer = document.getElementById('viewer'), vwStage = document.getElementById('vwStage'), vwImg = document.getElementById('vwImg');
    const vwPrevImg = document.getElementById('vwPrevImg'), vwNextImg = document.getElementById('vwNextImg'), vwBg = document.getElementById('vwBg');
    const vwMark = document.getElementById('vwMark'), vwHint = document.getElementById('vwHint');
    const SOFT_EASE = 'cubic-bezier(.22, 1, .36, 1)';
    const SLIDE_GAP = 24;   // the dark gap between two photos while you swipe
    let vwHinted = false, sliding = false;
    function vwPaint() {
      const p = current();
      if (!p) return;
      const countEl = document.getElementById('vwCount');
      const k = M.only ? M.only.indexOf(M.i) : -1;
      const num = document.createElement('span'); num.className = 'vw-num';
      num.innerHTML = '<b></b> <span></span>';
      num.firstChild.textContent = k >= 0 ? k + 1 : M.i + 1; num.lastChild.textContent = `of ${k >= 0 ? M.only.length : M.a.pics.length}`;
      countEl.replaceChildren(num);
      if (p.by) {
        const av = document.createElement('span'); av.className = 'vw-av'; av.setAttribute('aria-hidden', 'true');
        av.textContent = (String(p.by).trim()[0] || '·').toUpperCase(); av.style.setProperty('--c', avColor(p.by));
        const s = document.createElement('small'); s.textContent = `Added by ${p.by}`;
        countEl.append(av, s);
      }
      const marked = isBookmarked(p);
      vwMark.setAttribute('aria-pressed', marked);
      vwMark.setAttribute('aria-label', marked ? 'Remove this photo’s bookmark' : 'Bookmark this photo');
      vwMark.title = marked ? 'Bookmarked' : 'Bookmark';
      const vwReact = document.getElementById('vwReact'), vwFace = document.getElementById('vwFace'), total = reactTotal(p);
      if (p.reaction) vwFace.textContent = p.reaction; else vwFace.innerHTML = VW_SMILE;
      vwReact.classList.toggle('has-mine', !!p.reaction);
      vwReact.querySelector('.vw-react-label').textContent = p.reaction ? 'Reacted' : 'React';
      vwReact.setAttribute('aria-label', `${p.reaction ? `Your reaction: ${REACT_NAME[p.reaction] || p.reaction}. Change or remove it` : 'React to this photo'}, ${plural(total, 'reaction', 'reactions')} so far`);
      // "Album cover" on the photo that's the cover now (moving between photos doesn't run renderSocial)
      const cover = coverOf(M.a);
      document.getElementById('pbCover').hidden = !(cover && cover.id === p.id);
      // The arrows (computers only) stop at the first and last photo, like a swipe does
      document.getElementById('vwPrev').hidden = stepTarget(-1) == null; document.getElementById('vwNext').hidden = stepTarget(1) == null;
      // Delete is for photos you added (or any, as the host); Hide is for other people's photos
      document.getElementById('vwDel').hidden = !canDel(M.a, p);
      document.getElementById('vwHide').hidden = !canHide(M.a, p);
      document.getElementById('vwReport').hidden = !canHide(M.a, p);
    }
    // The photo d steps away (1 = next, -1 = previous), among just a notification's photos when that's what's
    // showing. null past the first or last one, unless `wrap` (the keyboard goes round)
    function stepTarget(d, wrap = false) {
      const list = M.only && M.only.includes(M.i) ? M.only : null, n = list ? list.length : (M.a?.pics.length || 0);
      if (n < 2) return null;
      const j = (list ? list.indexOf(M.i) : M.i) + d;
      if (!wrap && (j < 0 || j >= n)) return null;
      const at = (j + n) % n;
      return list ? list[at] : at;
    }
    const thumbAt = (i) => { const p = M.a?.photoItems?.[i]; return p ? (p.thumbnailUrl || pic(p.url, 400, 400)) : ''; };
    // The glow behind the photo: the new one fades in on the layer that isn't showing
    let ambAt = 0;
    function setAmbient(url) {
      const layers = vwBg.querySelectorAll('.vw-amb'), on = layers[ambAt];
      if (!url || on.getAttribute('src') === url) return;
      ambAt = 1 - ambAt;
      const next = layers[ambAt];
      next.onload = () => { next.classList.add('is-on'); on.classList.remove('is-on'); };
      next.src = url;
    }
    // The strip along the bottom: one small photo for each (or for just a notification's photos)
    const vwFilm = document.getElementById('vwFilm');
    // at: the photo to mark (a swipe marks where it's going as it starts, so the strip glides along with it)
    function paintFilm(at = M.i) {
      const list = M.only && M.only.includes(M.i) ? M.only : (M.a?.photoItems || []).map((_, n) => n);
      const key = (M.a?.id || '') + ':' + list.join(',');
      if (list.length < 2) { vwFilm.replaceChildren(); vwFilm.dataset.key = ''; return; }
      if (vwFilm.dataset.key !== key) {
        vwFilm.dataset.key = key;
        vwFilm.replaceChildren(...list.map((n, k) => {
          const b = document.createElement('button');
          b.type = 'button'; b.dataset.n = n; b.setAttribute('aria-label', `Photo ${k + 1} of ${list.length}`);
          // The ones near where you are load straight away (no blank boxes while swiping); far ones as you get there
          const img = document.createElement('img'); img.alt = ''; img.decoding = 'async';
          if (Math.abs(n - at) > 20) img.loading = 'lazy';
          img.src = M.a?.photoItems?.[n]?.miniUrl || thumbAt(n);   // the strip pictures are 26-32px: the mini is plenty
          b.append(img);
          return b;
        }));
      }
      let cur = null;
      for (const b of vwFilm.children) { const on = +b.dataset.n === at; if (on) cur = b; if ((b.getAttribute('aria-current') === 'true') !== on) b.setAttribute('aria-current', on); }
      if (cur) {
        const left = cur.offsetLeft + cur.offsetWidth / 2 - vwFilm.clientWidth / 2;
        // First paint of an album jumps straight there; after that it glides along
        vwFilm.scrollTo({ left, behavior: vwFilm._shown && !still ? 'smooth' : 'auto' });
        vwFilm._shown = true;
      }
    }
    vwFilm.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || sliding) return;
      filmUser = false;   // a tap picks the photo itself; the strip's glide to it isn't a swipe
      const n = +b.dataset.n;
      if (n === M.i) return;
      if (n === stepTarget(1)) slideTo(1); else if (n === stepTarget(-1)) slideTo(-1); else show(n);
      hideSwipeHint(true);
    });
    // Swiping the strip itself: it snaps to one photo, and when it comes to rest that photo is shown. Only a
    // scroll you made counts (the strip gliding along after a photo change is ours, and is ignored)
    let filmTouch = false, filmUser = false, filmT = 0;
    function filmSettle() {
      clearTimeout(filmT);
      if (filmTouch || !filmUser || !viewer.open || sliding || viewer._closing) return;
      filmUser = false;
      const mid = vwFilm.getBoundingClientRect().left + vwFilm.clientWidth / 2;
      let best = null, bestD = Infinity;
      for (const b of vwFilm.children) { const r = b.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid); if (d < bestD) { bestD = d; best = b; } }
      if (!best) return;
      const n = +best.dataset.n;
      if (n !== M.i) { show(n); hideSwipeHint(true); navigator.vibrate?.(4); }
      else paintFilm();   // back on the same photo: centre it exactly
    }
    vwFilm.addEventListener('touchstart', () => { filmTouch = true; filmUser = true; clearTimeout(filmT); }, { passive: true });
    const filmLift = () => { filmTouch = false; clearTimeout(filmT); filmT = setTimeout(filmSettle, 180); };
    vwFilm.addEventListener('touchend', filmLift, { passive: true });
    vwFilm.addEventListener('touchcancel', filmLift, { passive: true });
    vwFilm.addEventListener('wheel', () => { filmUser = true; }, { passive: true });
    vwFilm.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') filmUser = true; });
    vwFilm.addEventListener('scroll', () => { if (!filmUser) return; clearTimeout(filmT); filmT = setTimeout(filmSettle, 140); }, { passive: true });
    vwFilm.addEventListener('scrollend', () => { if (filmUser) filmSettle(); });
    // "Swipe to see more photos": on the first few visits, until you've moved between photos once
    const vwSwipe = document.getElementById('vwSwipe');
    let swipeTimer = 0;
    const swipeLearned = () => { try { return localStorage.getItem('momento.swiped') === '1'; } catch { return false; } };
    function showSwipeHint() {
      clearTimeout(swipeTimer);
      if (swipeLearned() || finePointer || stepTarget(1) == null && stepTarget(-1) == null) { vwSwipe.hidden = true; return; }
      vwSwipe.hidden = false; vwSwipe.classList.remove('is-gone');
      if (!still) vwSwipe.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 500, easing: SOFT_EASE, fill: 'backwards' });
      swipeTimer = setTimeout(() => hideSwipeHint(false), 4200);
    }
    function hideSwipeHint(learned) {
      clearTimeout(swipeTimer);
      if (learned) try { localStorage.setItem('momento.swiped', '1'); } catch {}
      if (vwSwipe.hidden) return;
      vwSwipe.classList.add('is-gone');
      setTimeout(() => { vwSwipe.hidden = true; }, 420);
    }
    // The zoom (see "Zoom" below) and the gesture under way on the photo
    const Z = { s: 1, x: 0, y: 0, fit: null, max: 6, raf: 0, tick: 0, anim: null, fling: null };
    let gz = null, g = null, lastTap = null, tapTimer = 0;
    const fingers = new Map();
    const urlAt = (i) => { const p = M.a?.photoItems?.[i]; return p ? (p.url || pic(M.a.pics[i], 1600, 1000)) : ''; };
    const sideOff = () => innerWidth + SLIDE_GAP;
    // Photos already fetched and decoded, kept (the last few dozen) so moving back and forth never waits or
    // flickers. A photo that's ready swaps in on the very next frame
    const imgCache = new Map();
    function cacheImg(url) {
      if (!url) return null;
      let c = imgCache.get(url);
      if (c) { imgCache.delete(url); imgCache.set(url, c); return c; }
      const img = new Image(); img.decoding = 'async'; img.src = url;
      c = { img, ready: false };
      c.p = img.decode().then(() => { c.ready = true; }, () => { c.ready = img.complete && img.naturalWidth > 0; });
      imgCache.set(url, c);
      while (imgCache.size > 40) imgCache.delete(imgCache.keys().next().value);
      return c;
    }
    const isReady = (url) => { const c = url && imgCache.get(url); return !!c && (c.ready || (c.img.complete && c.img.naturalWidth > 0)); };
    // Where the three photos sit, dx pixels into a swipe (a zoomed photo keeps its own place)
    function place(dx) {
      const off = sideOff();
      if (!isZoomed()) vwImg.style.transform = dx ? `translate3d(${dx}px, 0, 0)` : '';
      vwPrevImg.style.transform = `translate3d(${dx - off}px, 0, 0)`;
      vwNextImg.style.transform = `translate3d(${dx + off}px, 0, 0)`;
    }
    // The photos either side, ready for a swipe. A picture keeps showing its old photo until its new one has
    // loaded, so a side whose photo isn't ready shows that photo's small grid picture instead (stretched to the
    // full size's place), or nothing at all: never the photo you're already looking at
    function fillSide(el, i) {
      if (i == null) { el.removeAttribute('src'); el.dataset.want = ''; return; }
      const url = urlAt(i), small = thumbAt(i);
      if (el.dataset.want === url && el.getAttribute('src')) return;
      el.dataset.want = url;
      el.decoding = 'async';
      const sharp = () => { if (el.dataset.want !== url) return; el.style.width = ''; el.style.height = ''; el.style.opacity = ''; el.src = url; };
      cacheImg(url);
      if (isReady(url)) { sharp(); return; }
      el.style.opacity = '0';
      const th = cacheImg(small);
      const blurry = () => {
        if (el.dataset.want !== url || isReady(url) || !th?.img.naturalWidth) return;
        const [w, h] = fitBox(th.img.naturalWidth, th.img.naturalHeight);
        el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.opacity = ''; el.src = small;
      };
      if (th && isReady(small)) blurry(); else th?.p.then(blurry);
      imgCache.get(url).p.then(sharp);
    }
    function paintSides() {
      fillSide(vwPrevImg, stepTarget(-1));
      fillSide(vwNextImg, stepTarget(1));
      place(0);
    }
    // Puts photo i on the main image straight away, so the last photo never lingers while the new one loads:
    // the full size when it's already loaded, otherwise its small grid picture (already loaded for the grid)
    // stretched to the full size's place, swapped for the sharp one the moment that has loaded
    let vwSeq = 0;
    function fitBox(w, h) {
      const cs = getComputedStyle(vwImg);
      const mw = parseFloat(cs.maxWidth) || innerWidth, mh = parseFloat(cs.maxHeight) || innerHeight;
      const s = Math.min(mw / w, mh / h);
      return [Math.round(w * s), Math.round(h * s)];
    }
    function setPhoto(i, alt) {
      const seq = ++vwSeq, url = urlAt(i), small = thumbAt(i);
      const sharp = () => {
        if (seq !== vwSeq) return;
        vwImg.style.width = ''; vwImg.style.height = ''; vwImg.style.opacity = ''; vwImg.src = url; vwImg.alt = alt;
        if (isZoomed()) zRefit();   // the sharp photo can be a touch different in shape from its grid picture
      };
      const full = cacheImg(url);
      if (isReady(url)) { sharp(); return; }
      const th = cacheImg(small);
      const blurry = () => {
        if (seq !== vwSeq || isReady(url) || !th?.img.naturalWidth) return;
        const [w, h] = fitBox(th.img.naturalWidth, th.img.naturalHeight);
        vwImg.style.width = w + 'px'; vwImg.style.height = h + 'px'; vwImg.style.opacity = '';
        vwImg.src = small; vwImg.alt = alt;
      };
      if (th && isReady(small)) blurry();
      else {
        // Nothing of this photo is loaded yet: hide the last one rather than show the wrong photo
        vwImg.style.opacity = '0';
        th?.p.then(blurry);
      }
      full.p.then(sharp);
    }
    // The next two photos either way load in the background too, so moving along never waits
    function prefetchAround() {
      for (const d of [1, -1, 2, -2]) {
        if (Math.abs(d) === 2 && stepTarget(d / 2) == null) continue;
        const t = stepTarget(d);
        if (t != null) { cacheImg(urlAt(t)); cacheImg(thumbAt(t)); }
      }
    }
    // While photos are flying past, the soft glow behind them changes once they stop, not on every one
    let lastLoadAt = 0, ambT = 0;
    function vwLoad(fade) {
      const p = current();
      if (!p) return;
      unzoom();
      // This photo's own reactions (not the last photo's), its React button and its cover badge
      renderSocial();
      if (!viewer.open) vwPaint();
      setPhoto(M.i, `Photo ${M.i + 1}${p.by ? ', added by ' + p.by : ''}`);
      paintSides();
      const now = performance.now(), quick = now - lastLoadAt < 350;
      lastLoadAt = now;
      clearTimeout(ambT);
      if (quick && viewer.open) ambT = setTimeout(() => setAmbient(thumbAt(M.i)), 180); else setAmbient(thumbAt(M.i));
      paintFilm();
      prefetchAround();
      prefetchWho(p);
      if (viewer.open) syncAddress(); else setTimeout(syncAddress, 0);   // (the viewer opens right after this)
      if (!fade || still) return;
      // A jump (the strip along the bottom): a quick soft fade, never a wait
      vwImg.getAnimations().forEach((a) => a.cancel());
      vwImg.animate([{ opacity: .35, transform: 'scale(.985)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: SOFT_EASE });
    }
    // Slide to the next (1) or previous (-1) photo, carrying on from dx pixels into a swipe. False at either end.
    // `quick`: more slides are waiting (fast swipes, a held arrow key), so this one goes faster
    function slideTo(d, fromDx = 0, speed = 0, quick = false) {
      const t = stepTarget(d);
      if (t == null || sliding) return false;
      if (still) { show(t); return true; }
      sliding = true;
      fillSide(d > 0 ? vwNextImg : vwPrevImg, t);   // (already there, unless the album just changed)
      const off = sideOff(), side = d > 0 ? vwNextImg : vwPrevImg, left = Math.abs(-d * off - fromDx);
      // Quicker when the finger was moving fast, never slower than a calm 340ms
      const duration = quick ? 190 : clamp(speed ? left / Math.max(Math.abs(speed) * 1.6, .9) : 340, 160, 340);
      const go = (el, a) => el.animate([{ transform: `translate3d(${a}px, 0, 0)` }, { transform: `translate3d(${a - d * off - fromDx}px, 0, 0)` }], { duration, easing: quick ? 'cubic-bezier(.3, .7, .4, 1)' : 'cubic-bezier(.2, .9, .3, 1)', fill: 'forwards' });
      const runs = [go(vwImg, fromDx), go(vwPrevImg, fromDx - off), go(vwNextImg, fromDx + off)];
      paintFilm(t);   // the strip moves with the photo, not after it
      hideSwipeHint(true);
      runs[0].finished.then(() => {
        // The main photo takes over exactly what slid in (the same picture, at the same size), then everything
        // snaps back home unseen. It sharpens by itself if that was still the small picture
        M.i = t;
        vwSeq++;
        vwImg.style.width = side.style.width; vwImg.style.height = side.style.height; vwImg.style.opacity = side.style.opacity;
        const src = side.getAttribute('src');
        if (src) vwImg.src = src; else vwImg.style.opacity = '0';
        side.dataset.want = '';
        runs.forEach((a) => a.cancel());
        sliding = false;
        vwLoad(false);
        runQueuedSlide();
      }, () => { sliding = false; queuedSlide = 0; });
      navigator.vibrate?.(4);
      return true;
    }
    // Swipes and arrow presses made while a slide is still running add up, and carry straight on once it lands.
    // Three or more waiting: it jumps straight there rather than making you watch every photo go by
    let queuedSlide = 0;
    const queueSlide = (d) => { queuedSlide = clamp(queuedSlide + d, -30, 30); };
    function runQueuedSlide() {
      const q = queuedSlide;
      queuedSlide = 0;
      if (!q || !viewer.open || viewer._closing || sliding) return;
      const d = Math.sign(q);
      if (Math.abs(q) >= 3) {
        const at = M.i;
        let t = at;
        for (let k = 0; k < Math.abs(q); k++) { M.i = t; const n = stepTarget(d); if (n == null) break; t = n; }
        M.i = at;
        if (t !== at) { show(t); hideSwipeHint(true); }
        return;
      }
      if (slideTo(d, 0, 0, true)) queuedSlide = q - d;
    }
    // Back into place after a swipe that didn't go far enough (or ran into the first or last photo)
    function settleX(fromDx) {
      place(0);
      if (still || !fromDx) return;
      const off = sideOff(), o = { duration: 420, easing: 'cubic-bezier(.25, 1.25, .5, 1)' };
      vwImg.animate([{ transform: `translate3d(${fromDx}px, 0, 0)` }, { transform: 'none' }], o);
      vwPrevImg.animate([{ transform: `translate3d(${fromDx - off}px, 0, 0)` }, { transform: `translate3d(${-off}px, 0, 0)` }], o);
      vwNextImg.animate([{ transform: `translate3d(${fromDx + off}px, 0, 0)` }, { transform: `translate3d(${off}px, 0, 0)` }], o);
    }
    function openViewer(from = null) {
      if (!M.a || !M.a.pics.length || viewer.open) return;
      viewer.classList.remove('is-zoomed', 'is-bare', 'is-pulling', 'has-sheet');
      vwBg.style.opacity = '';
      vwLoad(false);
      vwHint.hidden = vwHinted; vwHinted = true;
      if (!finePointer) vwHint.textContent = 'Pinch to zoom. Double-tap to react with a ❤️';
      viewer.showModal();
      vwFilm._shown = false; paintFilm();
      showSwipeHint();
      if (!finePointer && viewer.contains(document.activeElement)) document.activeElement.blur();
      if (still) return;
      // The dark fades up, the bars follow, and the photo grows out of the album's photo into place
      vwBg.animate({ opacity: [0, 1] }, { duration: 320, easing: 'ease-out' });
      for (const el of viewer.querySelectorAll('.vw-top, .vw-foot, .vw-film')) el.animate({ opacity: [0, 1] }, { duration: 260, delay: 160, easing: 'ease-out', fill: 'backwards' });
      const go = () => {
        const a = from?.getBoundingClientRect(), b = vwImg.getBoundingClientRect();
        if (!a || !a.width || !b.width) { vwImg.animate([{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: SOFT_EASE }); return; }
        vwImg.animate([
          { transform: `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(a.width / b.width, a.height / b.height)})`, borderRadius: '22px' },
          { transform: 'none', borderRadius: '6px' },
        ], { duration: 480, easing: SOFT_EASE });
      };
      vwImg.complete && vwImg.naturalWidth ? go() : vwImg.addEventListener('load', go, { once: true });
    }
    // Closing: the photo shrinks back into its place in the album while the dark fades away. From a pull
    // down, it carries on from wherever your finger let go
    function closeViewer() {
      if (!viewer.open || viewer._closing) return;
      closePicker(false);
      if (still) { viewer.close(); return; }
      viewer._closing = true;
      const tile = thumbsEl.children[M.i], tImg = tile && !tile.hidden ? tile.querySelector('img') : null;
      tile?.scrollIntoView({ block: 'nearest' });
      const from = vwImg.style.transform || 'none', fromBg = +(vwBg.style.opacity || 1);
      vwImg.getAnimations().forEach((a) => a.cancel());
      vwImg.style.transform = '';
      const a = tImg?.getBoundingClientRect(), b = vwImg.getBoundingClientRect();
      const box = albumModal.querySelector('.album-scroll')?.getBoundingClientRect();
      const seen = a && b.width && box && a.bottom > box.top && a.top < box.bottom;
      const ease = 'cubic-bezier(.32, .72, 0, 1)', duration = 380;
      const to = seen
        ? `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${Math.max(a.width / b.width, a.height / b.height)})`
        : `translateY(${from === 'none' ? 60 : innerHeight * .5}px) scale(.8)`;
      const jobs = [
        vwImg.animate(seen
          ? [{ transform: from, opacity: 1, borderRadius: '6px' }, { transform: to, opacity: 1, borderRadius: '4px', offset: .85 }, { transform: to, opacity: 0, borderRadius: '4px' }]
          : [{ transform: from, opacity: 1 }, { transform: to, opacity: 0 }], { duration, easing: ease, fill: 'forwards' }).finished,
        vwBg.animate({ opacity: [fromBg, 0] }, { duration: duration - 60, easing: 'ease-out', fill: 'forwards' }).finished,
      ];
      for (const el of viewer.querySelectorAll('.vw-top, .vw-foot, .vw-nav, .vw-film, .vw-swipe')) el.animate({ opacity: [getComputedStyle(el).opacity, 0] }, { duration: 160, easing: 'ease-out', fill: 'forwards' });
      Promise.all(jobs).catch(() => {}).then(() => {
        viewer.close();
        viewer.getAnimations({ subtree: true }).forEach((x) => x.cancel());
        vwBg.style.opacity = ''; viewer.classList.remove('is-bare', 'is-pulling');
        viewer._closing = false;
      });
    }
    // Arrow keys and the arrow buttons: slide along, going round from the last photo to the first
    const vwStep = (d) => {
      if (sliding) { queueSlide(d); return; }   // (pressed again mid-slide: it carries on once this one lands)
      if (slideTo(d)) return;
      const t = stepTarget(d, true);
      if (t != null) show(t);
    };
    document.getElementById('vwClose').addEventListener('click', closeViewer);
    document.getElementById('vwDel').addEventListener('click', (e) => { const p = current(); if (p) binPhotos([p], e.currentTarget); });
    document.getElementById('vwHide').addEventListener('click', (e) => { const p = current(); if (p) hidePhotos([p], e.currentTarget); });
    document.getElementById('vwReport').addEventListener('click', (e) => { const p = current(); if (p) reportPhoto(p, e.currentTarget); });
    // ---- Report a photo (Terms: "Reporting a photo"): a reason and an optional note go to the server, the photo
    // leaves the reporter's view straight away, and enough reports hide it for everyone until staff decide ----
    function reportPhoto(p, from) {
      const a = M.a;
      if (!a || !canHide(a, p)) return;
      const d = document.createElement('dialog');
      d.className = 'ev-ask';
      d.setAttribute('aria-labelledby', 'rpTitle');
      d.innerHTML = `<form method="dialog" style="display:grid;gap:.7rem">
        <h2 id="rpTitle">Report this photo?</h2>
        <p>Tell us what's wrong. You won't see it again, and we'll take a look.</p>
        <label class="acct-field rp-field"><span>Reason</span>
          <select name="reason">
            <option value="" disabled selected hidden>Choose a reason</option>
            <option value="nudity">Nudity or sexual content</option>
            <option value="abuse">Violence, hate or harassment</option>
            <option value="privacy">I'm in it and didn't agree to it</option>
            <option value="copyright">It's my photo or work (copyright)</option>
            <option value="other">Something else</option>
          </select></label>
        <label class="acct-field rp-field"><span>More detail (optional)</span>
          <textarea name="note" maxlength="1000" rows="3" placeholder="Anything that helps us check it"></textarea></label>
        <p class="rp-err" role="alert"></p>
        <div class="mq-row"><button class="mq-btn is-light" type="button" data-no>Cancel</button><button class="mq-btn" type="submit" data-yes>Report</button></div>
      </form>`;
      document.body.append(d);
      const form = d.querySelector('form'), err = d.querySelector('.rp-err'), yes = d.querySelector('[data-yes]');
      const done = () => { if (d.open) d.close(); d.remove(); from?.focus?.(); };
      d.querySelector('[data-no]').addEventListener('click', done);
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(); });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = form.reason.value;
        // (the select is hidden behind Momento's glass dropdown: focus its button)
        if (!reason) { err.textContent = 'Choose a reason.'; (form.reason.nextElementSibling || form.reason).focus(); return; }
        if (yes.disabled) return;
        yes.disabled = true; yes.textContent = 'Reporting…';
        try {
          const r = await momentoApi('/api/photos/' + encodeURIComponent(p.id) + '/report', momentoJson('POST', { reason, note: form.note.value.trim() }));
          done();
          Momento.toast('Photo reported', r.message || 'Thanks for telling us. You won’t see this photo any more.');
          try { await afterPhotos(a, M.i); } catch {}
        } catch (e2) { err.textContent = e2.message; yes.disabled = false; yes.textContent = 'Report'; }
      });
      d.showModal();
      requestAnimationFrame(() => (form.reason.nextElementSibling || form.reason).focus());   // the dropdown is added a moment later
    }
    // Back in the grid, the photo you were looking at is the one in view
    viewer.addEventListener('close', () => syncAddress());
    viewer.addEventListener('close', () => { thumbsEl.children[M.i]?.scrollIntoView({ block: 'nearest' }); thumbsEl.children[M.i]?.focus({ preventScroll: true }); });
    document.getElementById('vwPrev').addEventListener('click', () => vwStep(-1));
    document.getElementById('vwNext').addEventListener('click', () => vwStep(1));
    document.getElementById('vwDownload').addEventListener('click', () => { const p = current(); if (p) location.href = p.downloadUrl || window.MOMENTO_API + '/api/photos/' + p.id + '/download'; });
    vwMark.addEventListener('click', () => setBookmark(!isBookmarked(current())));
    viewer.addEventListener('cancel', (e) => { e.preventDefault(); if (isZoomed()) unzoom(true); else closeViewer(); });
    viewer.addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, .rx-picker, .rx-who')) return;   // typing a search, or moving through the emoji
      // Zoomed, the arrow keys look around the photo; otherwise left and right move between photos
      const PAN = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (PAN && isZoomed() && zMeasure()) { e.preventDefault(); const [x, y] = zClampXY(Z.s, Z.x + PAN[0] * 120, Z.y + PAN[1] * 120); zAnimTo(Z.s, x, y, 180); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); vwStep(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); vwStep(-1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(zTarget() * 1.5, undefined, undefined, true); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(zTarget() / 1.5, undefined, undefined, true); }
      else if (e.key === '0') { e.preventDefault(); unzoom(true); }
    });
    // Zoom: the photo keeps its fitted size and is scaled and moved with a transform, so zooming and looking
    // around never re-lays out the page and stays smooth. Every way in zooms around the spot under the pointer
    // (or between your fingers), from the fitted size up to Z.max:
    //   a pinch on a phone (as many times as you like, in or out), a trackpad pinch on a Mac or a laptop
    //   (Safari's own pinch too), Ctrl or ⌘ + the wheel, the mouse wheel, a click, the − and + buttons, + − 0.
    // Zoomed: drag (a finger, the mouse, a trackpad scroll or the arrow keys) to look around. It glides on a
    // little after a flick, gives a little at the edges, and never leaves the photo's edge inside the screen
    const vwZoomIn = document.getElementById('vwZoomIn'), vwZoomOut = document.getElementById('vwZoomOut'), vwZoomFit = document.getElementById('vwZoomFit');
    const zoomLevel = () => Z.s;
    function isZoomed() { return Z.s > 1.01; }
    // The photo's fitted size and centre on screen (transforms don't change these, so this is cheap and exact)
    function zMeasure() {
      const w = vwImg.offsetWidth, h = vwImg.offsetHeight;
      if (!w || !h) return false;
      const sr = vwStage.getBoundingClientRect();
      Z.fit = { w, h, cx: sr.left + vwImg.offsetLeft + w / 2, cy: sr.top + vwImg.offsetTop + h / 2 };
      Z.max = clamp(((vwImg.naturalWidth || w) / w) * 2, 6, 10);
      return true;
    }
    // How far the photo may move at scale s: its edges stay at or beyond the screen's (a photo still smaller
    // than the screen one way may sit anywhere that way, as long as all of it stays on screen)
    function zBounds(s) {
      const f = Z.fit, W = f.w * s, H = f.h * s, vw = innerWidth, vh = innerHeight;
      const rx = W > vw ? [vw - f.cx - W / 2, W / 2 - f.cx] : [W / 2 - f.cx, vw - f.cx - W / 2];
      const ry = H > vh ? [vh - f.cy - H / 2, H / 2 - f.cy] : [H / 2 - f.cy, vh - f.cy - H / 2];
      // (at the fitted size the photo stays exactly where it sits)
      const k = clamp((s - 1) / .25, 0, 1);
      return { x0: Math.min(0, rx[0]) * (1 - k) + rx[0] * k, x1: Math.max(0, rx[1]) * (1 - k) + rx[1] * k, y0: Math.min(0, ry[0]) * (1 - k) + ry[0] * k, y1: Math.max(0, ry[1]) * (1 - k) + ry[1] * k };
    }
    const zClampXY = (s, x, y) => { const b = zBounds(s); return [clamp(x, b.x0, b.x1), clamp(y, b.y0, b.y1)]; };
    // Past an edge it gives a little, like a rubber band
    const give = (v, lo, hi) => (v < lo ? lo - (lo - v) / (1 + (lo - v) / 160) : v > hi ? hi + (v - hi) / (1 + (v - hi) / 160) : v);
    // Where the photo goes so that the spot under (px, py) stays under it at scale s
    function zAround(s, px, py) {
      const f = Z.fit, qx = (px - f.cx - Z.x) / Z.s, qy = (py - f.cy - Z.y) / Z.s;
      return [px - f.cx - s * qx, py - f.cy - s * qy];
    }
    function zDraw() {
      cancelAnimationFrame(Z.raf); Z.raf = 0;
      const moved = Z.s > 1.001 || Math.abs(Z.x) > .5 || Math.abs(Z.y) > .5;
      vwImg.style.transform = moved ? `translate3d(${Z.x}px, ${Z.y}px, 0) scale(${Z.s})` : '';
      const z = isZoomed();
      if (viewer.classList.contains('is-zoomed') !== z) {
        viewer.classList.toggle('is-zoomed', z); vwStage.classList.toggle('is-zoomed', z);
        if (z) { vwHint.hidden = true; if (openPick) closePicker(false); }
      }
      paintZoom();
    }
    const zQueue = () => { if (!Z.raf) Z.raf = requestAnimationFrame(zDraw); };
    // While the photo moves it's kept on its own layer; once it rests it's drawn again, sharp at the new size
    const zMoving = (on) => vwStage.classList.toggle('is-moving', on);
    function zStop() { Z.anim = null; Z.fling = null; cancelAnimationFrame(Z.tick); Z.tick = 0; }
    function zTick(now) {
      Z.tick = 0;
      if (Z.anim) {
        const a = Z.anim, t = Math.min(1, (now - a.t0) / a.dur), e = easeOut(t);
        Z.s = lerp(a.s0, a.s1, e); Z.x = lerp(a.x0, a.x1, e); Z.y = lerp(a.y0, a.y1, e);
        if (t >= 1) Z.anim = null;
      } else if (Z.fling) {
        // Gliding on after a flick, slowing down; at an edge it stops quickly and settles back
        const f = Z.fling, dt = Math.min(32, now - f.t);
        f.t = now;
        Z.x += f.vx * dt; Z.y += f.vy * dt;
        const b = zBounds(Z.s), out = Z.x < b.x0 || Z.x > b.x1 || Z.y < b.y0 || Z.y > b.y1;
        const decay = Math.pow(out ? .6 : .95, dt / 16);
        f.vx *= decay; f.vy *= decay;
        if (Math.hypot(f.vx, f.vy) < .03) { Z.fling = null; zDraw(); zSettle(); return; }
      }
      zDraw();
      if (Z.anim || Z.fling) Z.tick = requestAnimationFrame(zTick); else zMoving(false);
    }
    function zAnimTo(s, x, y, dur = 280) {
      zStop();
      if (still) { Z.s = s; Z.x = x; Z.y = y; zDraw(); zMoving(false); return; }
      Z.anim = { s0: Z.s, x0: Z.x, y0: Z.y, s1: s, x1: x, y1: y, t0: performance.now(), dur };
      zMoving(true);
      Z.tick = requestAnimationFrame(zTick);
    }
    function zFling(vx, vy) {
      zStop();
      Z.fling = { vx: clamp(vx, -4, 4), vy: clamp(vy, -4, 4), t: performance.now() };
      zMoving(true);
      Z.tick = requestAnimationFrame(zTick);
    }
    // After a pinch or a drag: back within the limits (zoom and edges), smoothly
    function zSettle(px = innerWidth / 2, py = innerHeight / 2) {
      if (!Z.fit && !zMeasure()) return;
      if (Z.s < 1.02) { zAnimTo(1, 0, 0); return; }
      const s = Math.min(Z.s, Z.max);
      let [x, y] = s !== Z.s ? zAround(s, px, py) : [Z.x, Z.y];
      [x, y] = zClampXY(s, x, y);
      if (Math.abs(s - Z.s) < .001 && Math.abs(x - Z.x) < .5 && Math.abs(y - Z.y) < .5) { Z.s = s; Z.x = x; Z.y = y; zDraw(); zMoving(false); return; }
      zAnimTo(s, x, y, 300);
    }
    // The layout changed under a zoomed photo (a new window size, the sharp photo arriving): measure again
    function zRefit() { if (!zMeasure()) return; [Z.x, Z.y] = zClampXY(Z.s, Z.x, Z.y); zDraw(); }
    const zTarget = () => (Z.anim ? Z.anim.s1 : Z.s);
    function paintZoom() {
      const lv = zoomLevel(), text = lv > 1.01 ? `${Math.round(lv * 10) / 10}×` : 'Fit';
      if (vwZoomFit.textContent !== text) vwZoomFit.textContent = text;
      const outOff = lv <= 1.01, inOff = lv >= Z.max - .01;
      if (vwZoomOut.disabled !== outOff) vwZoomOut.disabled = outOff;
      if (vwZoomIn.disabled !== inOff) vwZoomIn.disabled = inOff;
    }
    function setZoom(lv, x = innerWidth / 2, y = innerHeight / 2, animate = false) {
      if (!zMeasure()) return;
      Z.anim = null; Z.fling = null;
      const s = clamp(lv, 1, Z.max);
      let [tx, ty] = zAround(s, x, y);
      [tx, ty] = zClampXY(s, tx, ty);
      if (animate) zAnimTo(s, tx, ty);
      else { zStop(); Z.s = s; Z.x = tx; Z.y = ty; zDraw(); }
    }
    vwZoomIn.addEventListener('click', () => setZoom(zTarget() * 1.5, undefined, undefined, true));
    vwZoomOut.addEventListener('click', () => setZoom(zTarget() / 1.5, undefined, undefined, true));
    vwZoomFit.addEventListener('click', () => unzoom(true));
    function unzoom(animate = false) {
      gz = null;
      if (animate && !still && (isZoomed() || Z.anim)) { if (Z.fit || zMeasure()) { zAnimTo(1, 0, 0); return; } }
      zStop();
      const was = Z.s !== 1 || Z.x || Z.y;
      Z.s = 1; Z.x = 0; Z.y = 0;
      cancelAnimationFrame(Z.raf); Z.raf = 0;
      if (was) vwImg.style.transform = '';
      viewer.classList.remove('is-zoomed'); vwStage.classList.remove('is-zoomed', 'is-dragging', 'is-moving');
      paintZoom();
    }
    // A click (or the first of a pinch's steps from the keys) on the fitted photo: 2.5×, on the spot you picked
    function zoomAt(x, y) { setZoom(2.5, x, y, true); }

    // The wheel. A trackpad pinch (Chrome, Edge, Firefox) and Ctrl or ⌘ + the wheel always zoom. A mouse wheel
    // zooms too. A two-finger trackpad scroll zooms in from the fitted size, and looks around once zoomed.
    // Everything that arrives within one frame is added up and drawn once
    let wheel = null, wheelRaf = 0, wheelKind = { t: 0, mouse: false }, wheelIdle = 0;
    function isMouseWheel(e, dx, dy) {
      if (e.deltaMode !== 0) return true;   // Firefox counts a mouse wheel in lines
      const now = performance.now();
      if (now - wheelKind.t < 250) { wheelKind.t = now; return wheelKind.mouse; }   // one burst keeps one kind
      // A trackpad scrolls in small, uneven steps (in Chrome and Safari its wheelDelta is exactly −3× its delta);
      // a mouse wheel in whole notches of about 100
      const trackpad = dx !== 0 || Math.abs(dy) < 40 || !Number.isInteger(dy) || (e.wheelDeltaY && e.wheelDeltaY === -3 * e.deltaY);
      wheelKind = { t: now, mouse: !trackpad };
      return !trackpad;
    }
    vwStage.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (viewer._closing || gz || fingers.size) return;
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
      const dx = e.deltaX * unit, dy = e.deltaY * unit;
      const pinch = e.ctrlKey || e.metaKey, mouse = !pinch && isMouseWheel(e, e.deltaX, e.deltaY);
      const w = wheel || (wheel = { f: 1, dx: 0, dy: 0, px: e.clientX, py: e.clientY });
      w.px = e.clientX; w.py = e.clientY;
      if (!pinch && !mouse && isZoomed()) { w.dx += dx; w.dy += dy; }
      else w.f *= Math.exp(-clamp(dy, -120, 120) * (pinch ? .012 : mouse ? .0024 : .006));
      if (!wheelRaf) wheelRaf = requestAnimationFrame(wheelApply);
    }, { passive: false });
    function wheelApply() {
      wheelRaf = 0;
      const w = wheel;
      wheel = null;
      if (!w || !viewer.open || !zMeasure()) return;
      Z.anim = null; Z.fling = null;
      if (w.f !== 1) {
        const s = clamp(Z.s * w.f, 1, Z.max);
        [Z.x, Z.y] = zClampXY(s, ...zAround(s, w.px, w.py));
        Z.s = s;
      }
      if (w.dx || w.dy) [Z.x, Z.y] = zClampXY(Z.s, Z.x - w.dx, Z.y - w.dy);
      zMoving(true);
      zDraw();
      clearTimeout(wheelIdle);
      wheelIdle = setTimeout(() => { if (!Z.anim && !Z.fling && !g) zMoving(false); }, 180);
    }
    // Safari's trackpad pinch arrives as its own gesture events (not as the wheel)
    viewer.addEventListener('gesturestart', (e) => {
      e.preventDefault();
      if (fingers.size || viewer._closing || !zMeasure()) return;   // (on a phone a pinch is handled as two fingers)
      zStop();
      gz = { s0: Z.s, x0: Z.x, y0: Z.y, px: e.clientX, py: e.clientY };
      zMoving(true);
    });
    viewer.addEventListener('gesturechange', (e) => {
      e.preventDefault();
      if (!gz) return;
      const f = Z.fit, s = clamp(gz.s0 * e.scale, .85, Z.max * 1.15);
      const qx = (gz.px - f.cx - gz.x0) / gz.s0, qy = (gz.py - f.cy - gz.y0) / gz.s0;
      const b = zBounds(s);
      Z.s = s; Z.x = give(gz.px - f.cx - s * qx, b.x0, b.x1); Z.y = give(gz.py - f.cy - s * qy, b.y0, b.y1);
      zQueue();
    });
    viewer.addEventListener('gestureend', (e) => {
      e.preventDefault();
      if (!gz) return;
      const at = gz;
      gz = null;
      zSettle(at.px, at.py);
    });

    // Gestures on the photo. Touch: swipe sideways to move between photos (the next one rides in with your
    // finger), pull down to close, pinch to zoom (again and again, in or out), drag a zoomed photo to look
    // around, tap to hide or show the bars, tap twice for a ❤️.
    // Mouse: drag works the same; a click zooms in (or back out), a click on the dark closes
    const DOUBLE_MS = 280;
    const toggleBars = () => viewer.classList.toggle('is-bare');
    function startPinch() {
      if (!zMeasure()) { g = null; return; }
      zStop(); clearTimeout(tapTimer); lastTap = null;
      const [a, b] = [...fingers.values()];
      g = { pinch: true, d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s0: Z.s, x0: Z.x, y0: Z.y };
      g.cx = g.mx; g.cy = g.my;
      zMoving(true);
    }
    function startPan(x, y, type, target, moved = false) {
      zStop();
      g = { pan: true, x, y, ox: Z.x, oy: Z.y, moved, type, target, lx: x, ly: y, lt: performance.now(), vx: 0, vy: 0 };
      zMoving(true);
    }
    vwStage.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || viewer._closing) return;
      // A new touch (no other finger down): forget any finger whose lift was missed, so a swipe is never mistaken
      // for a pinch (that left swiping stuck until the page was reloaded)
      if (e.isPrimary) fingers.clear();
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Every finger is followed to wherever it lifts, even off the photo (over the strip or the bars)
      try { vwStage.setPointerCapture(e.pointerId); } catch {}
      // Mid-slide: the photos keep gliding, and a quick swipe now is remembered and runs the moment they land
      if (sliding) { if (fingers.size === 1) g = { queue: true, x: e.clientX, y: e.clientY, dx: 0, lx: e.clientX, lt: performance.now(), vx: 0 }; return; }
      if (fingers.size === 2) {
        // A second finger: this is a pinch. Whatever the first finger was doing is put back
        if (g?.axis === 'x') settleX(g.px ?? g.dx); else if (g?.axis === 'y') settleY(g);
        vwStage.classList.remove('is-dragging');
        startPinch();
        return;
      }
      if (fingers.size > 2) return;
      // Zoomed: one finger (or the mouse) moves the photo around
      if (isZoomed()) { startPan(e.clientX, e.clientY, e.pointerType, e.target); return; }
      const now = performance.now();
      g = { x: e.clientX, y: e.clientY, axis: null, dx: 0, dy: 0, type: e.pointerType, target: e.target, lx: e.clientX, ly: e.clientY, lt: now, vx: 0, vy: 0 };
    });
    vwStage.addEventListener('pointermove', (e) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!g) return;
      if (g.queue) { const t = performance.now(); g.vx = .7 * ((e.clientX - g.lx) / Math.max(1, t - g.lt)) + .3 * g.vx; g.lx = e.clientX; g.lt = t; g.dx = e.clientX - g.x; return; }
      if (g.pinch) {
        if (fingers.size < 2) return;
        const [a, b] = [...fingers.values()];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        // Beyond the fitted size or the most it zooms, it only gives a little
        let s = g.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.d0);
        if (s < 1) s = 1 - (1 - s) / (1 + (1 - s) * 2.5);
        else if (s > Z.max) s = Z.max * (1 + (s / Z.max - 1) / (1 + (s / Z.max - 1) * 4));
        // The spot that was between your fingers stays between them, wherever they go
        const f = Z.fit, qx = (g.mx - f.cx - g.x0) / g.s0, qy = (g.my - f.cy - g.y0) / g.s0;
        const bd = zBounds(Math.max(1, s));
        Z.s = s; Z.x = give(mx - f.cx - s * qx, bd.x0, bd.x1); Z.y = give(my - f.cy - s * qy, bd.y0, bd.y1);
        g.cx = mx; g.cy = my;
        zQueue();
        return;
      }
      if (g.pan) {
        const now = performance.now(), dt = Math.max(1, now - g.lt);
        g.vx = .7 * ((e.clientX - g.lx) / dt) + .3 * g.vx; g.vy = .7 * ((e.clientY - g.ly) / dt) + .3 * g.vy;
        g.lx = e.clientX; g.ly = e.clientY; g.lt = now;
        const dx = e.clientX - g.x, dy = e.clientY - g.y;
        if (!g.moved) {
          if (Math.hypot(dx, dy) < 6) return;
          g.moved = true; clearTimeout(tapTimer); lastTap = null;
          vwStage.classList.add('is-dragging');
        }
        const b = zBounds(Z.s);
        Z.x = give(g.ox + dx, b.x0, b.x1); Z.y = give(g.oy + dy, b.y0, b.y1);
        zQueue();
        return;
      }
      const now = performance.now(), dt = Math.max(1, now - g.lt);
      g.vx = .7 * ((e.clientX - g.lx) / dt) + .3 * g.vx; g.vy = .7 * ((e.clientY - g.ly) / dt) + .3 * g.vy;
      g.lx = e.clientX; g.ly = e.clientY; g.lt = now;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        clearTimeout(tapTimer); lastTap = null;
        g.wasBare = viewer.classList.contains('is-bare');
        [vwImg, vwPrevImg, vwNextImg].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
        if (openPick) closePicker(false);
      }
      g.dx = dx; g.dy = dy;
      if (g.axis === 'x') {
        // Past the first or last photo it gives a little, like a rubber band
        const can = stepTarget(dx < 0 ? 1 : -1) != null;
        g.px = can ? dx : dx / (1 + Math.abs(dx) / 120);   // where the photo actually is: settling starts from here, not the finger
        place(g.px);
      } else {
        // Pulling down: the photo follows (and shrinks a touch) as the dark thins out; up only gives a little
        const y = dy > 0 ? dy : dy / (1 + Math.abs(dy) / 80), p = clamp(Math.max(0, dy) / (innerHeight * .45), 0, 1);
        vwImg.style.transform = `translate3d(${dx * .5}px, ${y}px, 0) scale(${1 - p * .22})`;
        vwBg.style.opacity = String(1 - p * .85);
        viewer.classList.add('is-pulling', 'is-bare');
      }
    });
    function settleY(s) {
      const from = vwImg.style.transform, fromBg = +(vwBg.style.opacity || 1);
      vwImg.style.transform = ''; vwBg.style.opacity = '';
      viewer.classList.remove('is-pulling');
      if (!s.wasBare) viewer.classList.remove('is-bare');
      if (still || !from) return;
      vwImg.animate([{ transform: from }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.25, 1.2, .5, 1)' });
      vwBg.animate({ opacity: [fromBg, 1] }, { duration: 300, easing: 'ease-out' });
    }
    // A tap. Two close together on the photo: react with a heart. One waits a moment to be sure it isn't the
    // first of two, then (touch) hides or shows the bars, or (mouse) zooms in on the photo, back out when it's
    // zoomed, or closes on the dark
    function tapAt(e, s) {
      if (justDismissed()) return;
      const now = performance.now(), x = e.clientX, y = e.clientY, onImg = s.target === vwImg, touch = s.type !== 'mouse';
      clearTimeout(tapTimer);
      if (lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < 40 && lastTap.onImg && onImg) {
        lastTap = null;
        doubleTap(x, y);
        return;
      }
      lastTap = { t: now, x, y, onImg };
      tapTimer = setTimeout(() => {
        lastTap = null;
        if (!viewer.open) return;
        if (touch) toggleBars();
        else if (isZoomed()) unzoom(true);
        else if (onImg) zoomAt(x, y); else closeViewer();
      }, onImg || touch ? DOUBLE_MS : 0);
    }
    function endGesture(e) {
      fingers.delete(e.pointerId);
      const s = g;
      if (!s) return;
      if (s.pinch) {
        // One finger still down on a zoomed photo: it carries on moving it
        if (fingers.size === 1 && Z.s > 1.01) { const p = [...fingers.values()][0]; startPan(p.x, p.y, 'touch', null, true); return; }
        g = null;
        zSettle(s.cx, s.cy);
        return;
      }
      if (s.pan) {
        g = null;
        vwStage.classList.remove('is-dragging');
        if (s.moved) {
          const fresh = performance.now() - s.lt < 80;
          if (e.type === 'pointerup' && !still && fresh && Math.hypot(s.vx, s.vy) > .15) zFling(s.vx, s.vy); else zSettle();
          return;
        }
        zMoving(false);
        if (e.type === 'pointerup' && s.target !== null) tapAt(e, s);
        return;
      }
      g = null;
      if (s.queue) {
        if (e.type === 'pointerup' && (Math.abs(s.dx) > 30 || Math.abs(s.vx) > .3)) queueSlide(s.dx < 0 ? 1 : -1);
        if (!sliding) runQueuedSlide();
        return;
      }
      const px = s.px ?? s.dx;
      if (e.type === 'pointercancel') { if (s.axis === 'x') settleX(px); else if (s.axis === 'y') settleY(s); return; }
      if (s.axis === 'x') {
        const d = s.dx < 0 ? 1 : -1, flick = Math.abs(s.vx) > .35 && Math.sign(s.vx) === Math.sign(s.dx);
        if ((Math.abs(s.dx) > innerWidth * .22 || flick) && slideTo(d, s.dx, flick ? s.vx : 0)) return;
        settleX(px);
        return;
      }
      if (s.axis === 'y') {
        if (s.dy > 0 && (s.dy > innerHeight * .14 || (s.vy > .45 && s.dy > 30))) closeViewer();
        else settleY(s);
        return;
      }
      tapAt(e, s);
    }
    vwStage.addEventListener('pointerup', endGesture);
    vwStage.addEventListener('pointercancel', endGesture);
    // A safety net: a finger lifted anywhere is no longer down (after the photo's own handler has had it)
    for (const t of ['pointerup', 'pointercancel']) addEventListener(t, (e) => {
      if (!fingers.delete(e.pointerId) || fingers.size || !g || g.pinch || e.target === vwStage || vwStage.contains(e.target)) return;
      if (g.axis === 'x') settleX(g.px ?? g.dx); else if (g.axis === 'y') settleY(g); else if (g.pan) { vwStage.classList.remove('is-dragging'); zSettle(); }
      g = null;
    });
    vwStage.addEventListener('dblclick', (e) => e.preventDefault());
    vwStage.addEventListener('contextmenu', (e) => { if (e.pointerType && e.pointerType !== 'mouse') e.preventDefault(); });
    // A double-tap gives the photo a ❤️ reaction. It never takes one away: if you've already reacted, your
    // reaction stays and just pops again
    function doubleTap(x, y) {
      const p = current();
      if (!p) return;
      const add = !p.reaction;
      burst(add ? '❤️' : p.reaction, x, y);
      if (add) toggleReaction('❤️', false);
      navigator.vibrate?.(12);
    }
    function burst(emoji, x, y) {
      const el = document.getElementById('vwBurst');
      el.textContent = emoji;
      el.style.left = x + 'px'; el.style.top = y + 'px';
      el.getAnimations().forEach((a) => a.cancel());
      el.animate(still
        ? [{ opacity: 0 }, { opacity: 1, offset: .2 }, { opacity: 1, offset: .7 }, { opacity: 0 }]
        : [
          { opacity: 0, transform: 'scale(.3) rotate(-12deg)' },
          { opacity: 1, transform: 'scale(1.18) rotate(4deg)', offset: .22 },
          { opacity: 1, transform: 'scale(.96) rotate(0deg)', offset: .38 },
          { opacity: 1, transform: 'scale(1)', offset: .62 },
          { opacity: 0, transform: 'translateY(-60px) scale(.85)' },
        ], { duration: 900, easing: 'cubic-bezier(.22, 1, .36, 1)' });
    }
    viewer.addEventListener('close', () => { clearTimeout(tapTimer); lastTap = null; g = null; gz = null; fingers.clear(); sliding = false; queuedSlide = 0; clearTimeout(ambT); unzoom(); place(0); hideSwipeHint(false); });
    // Only a real change of width (a phone turned round, a window resized) resets things: the keyboard
    // opening for the emoji search changes the height, and mustn't close anything
    let lastW = innerWidth;
    addEventListener('resize', () => {
      if (innerWidth === lastW) return;
      lastW = innerWidth;
      if (viewer.open) { if (isZoomed()) zRefit(); place(0); }
      closePicker(false);
    });

    // Reactions: React opens every emoji, with a search, above the button (or as a sheet on a phone). It shuts
    // on Esc, a tap elsewhere, a pull down on its handle, or when you move to another photo
    const emojiEl = document.getElementById('vwEmoji'), rxSearch = document.getElementById('rxSearch'), rxNone = document.getElementById('rxNone');
    function fillPicker(el) {
      const E = window.MomentoEmoji;
      const groups = E ? E.groups.map((name) => [name, E.all.filter((it) => it.group === name)]) : [['Popular', REACTIONS.map((e) => ({ e, name: REACT_NAME[e] }))]];
      el.replaceChildren(...groups.map(([name, list]) => {
        const sec = document.createElement('section');
        sec.className = 'rx-sec';
        const h = document.createElement('h4'); h.textContent = name; h.id = 'rxg-' + name.toLowerCase();
        const grid = document.createElement('div');
        grid.className = 'rx-grid'; grid.setAttribute('role', 'group'); grid.setAttribute('aria-labelledby', h.id);
        grid.append(...list.map(({ e, name: label }) => {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'rx'; b.dataset.e = e; b.textContent = e;
          b.setAttribute('aria-label', label); b.title = label;
          return b;
        }));
        sec.append(h, grid);
        return sec;
      }));
      el.addEventListener('click', (ev) => {
        const b = ev.target.closest('.rx');
        if (!b) return;
        const p = current(), e = b.dataset.e, adding = p && p.reaction !== e;
        closePicker(true);
        if (!p) return;
        toggleReaction(e, true);
        if (adding) { const r = vwImg.getBoundingClientRect(); burst(e, r.left + r.width / 2, r.top + r.height / 2); }
      });
      // Arrows move through the emoji (left, right, and a row up or down); up from the top row goes back to the search
      el.addEventListener('keydown', (ev) => {
        if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(ev.key)) return;
        ev.preventDefault(); ev.stopPropagation();
        const all = [...el.querySelectorAll('.rx:not([hidden])')], at = all.indexOf(document.activeElement);
        if (!all.length) return;
        const gridEl = el.classList.contains('is-searching') ? el : all[0].parentElement;
        const cols = Math.max(1, getComputedStyle(gridEl).gridTemplateColumns.split(' ').length);
        const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[ev.key];
        let to = ev.key === 'Home' ? 0 : ev.key === 'End' ? all.length - 1 : at + step;
        if (to < 0 && ev.key === 'ArrowUp') { rxSearch.focus(); return; }
        to = clamp(to, 0, all.length - 1);
        all[to].focus();
        all[to].scrollIntoView({ block: 'nearest' });
      });
    }
    const picker = document.getElementById('vwPicker'), reactButton = document.getElementById('vwReact');
    fillPicker(emojiEl);
    // Search: by name or a word for it ("love", "party", "cat"); Enter picks the first one found
    function filterEmoji() {
      const q = rxSearch.value.trim(), E = window.MomentoEmoji;
      // (an emoji typed into the search finds itself)
      const hits = q && isEmoji(q) && REACT_NAME[q] ? new Set([q]) : q && E ? new Set(E.search(q).map((it) => it.e)) : null;
      emojiEl.classList.toggle('is-searching', !!hits);
      for (const sec of emojiEl.querySelectorAll('.rx-sec')) {
        let any = false;
        for (const b of sec.querySelectorAll('.rx')) { const on = !hits || hits.has(b.dataset.e); b.hidden = !on; any ||= on; }
        sec.hidden = !any;
      }
      // An emoji typed or pasted from the keyboard reacts with exactly that emoji, listed or not
      emojiEl.querySelector('.rx-typed')?.remove();
      if (isEmoji(q) && !REACT_NAME[q]) {
        const sec = document.createElement('section');
        sec.className = 'rx-sec rx-typed';
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rx rx-typed-btn'; b.dataset.e = q;
        b.innerHTML = '<span class="e" aria-hidden="true"></span><span>React with this emoji</span>';
        b.firstChild.textContent = q; b.setAttribute('aria-label', `React with ${q}`);
        sec.append(b);
        emojiEl.prepend(sec);
        emojiEl.classList.add('is-searching');
      }
      const typed = !!emojiEl.querySelector('.rx-typed');
      rxNone.hidden = !hits || hits.size > 0 || typed;
      if (hits && !hits.size && !typed) rxNone.textContent = `No emoji for “${q}”. Try another word, or type the emoji itself.`;
      emojiEl.scrollTop = 0;
    }
    rxSearch.addEventListener('input', filterEmoji);
    rxSearch.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') return;   // closes the picker (the document's Esc handler)
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); emojiEl.querySelector('.rx:not([hidden])')?.click(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); emojiEl.querySelector('.rx:not([hidden])')?.focus(); }
    });
    // The keyboard (for the search) covers the bottom of a phone screen: the sheet rides up above it
    const vv = window.visualViewport;
    const syncKeyboard = () => {
      if (!vv) return;
      viewer.style.setProperty('--kb', Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)) + 'px');
      viewer.style.setProperty('--vvh', Math.round(vv.height) + 'px');
    };
    vv?.addEventListener('resize', syncKeyboard); vv?.addEventListener('scroll', syncKeyboard);
    const asSheet = () => phoneSheet.matches;
    // On a computer, a panel sits just above the button that opened it, kept inside the screen. (On a phone the
    // CSS makes it a sheet along the bottom and these are overridden)
    function placePanel(el, trigger, align = 'center') {
      el.style.transform = '';
      if (asSheet()) return;
      const r = trigger.getBoundingClientRect(), w = el.offsetWidth;
      const want = align === 'center' ? r.left + r.width / 2 - w / 2 : r.left - 6;
      el.style.left = clamp(want, 12, Math.max(12, innerWidth - w - 12)) + 'px';
      el.style.top = 'auto';
      el.style.bottom = Math.max(12, innerHeight - r.top + 10) + 'px';
    }
    function panelIn(el) {
      el._out = null;
      el.getAnimations().forEach((a) => a.cancel());
      el.hidden = false;
      viewer.classList.toggle('has-sheet', asSheet());
      syncKeyboard();
      if (still) return;
      if (asSheet()) el.animate([{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 420, easing: SHEET_IN });
      else el.animate([{ opacity: 0, transform: 'translateY(8px) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.34, 1.3, .64, 1)' });
    }
    function panelOut(el) {
      viewer.classList.remove('has-sheet');
      if (still || el.hidden || !viewer.open) { el.hidden = true; el.style.transform = ''; return; }
      const sheet = asSheet(), from = el.style.transform || 'none';
      el.getAnimations().forEach((a) => a.cancel());
      const run = el.animate(sheet ? [{ transform: from }, { transform: 'translateY(100%)' }] : [{ opacity: 1, transform: from }, { opacity: 0, transform: 'translateY(6px) scale(.97)' }],
        { duration: sheet ? 260 : 150, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
      el._out = run;
      run.finished.then(() => { if (el._out !== run) return; el.hidden = true; el.style.transform = ''; run.cancel(); }, () => {});
    }
    function openPicker(el, trigger, hover = false) {
      const p = current();
      if (!p) return;
      if (openPick) closePicker(false);
      openPick = { el, trigger, for: p.id, hover };
      if (rxSearch.value) { rxSearch.value = ''; filterEmoji(); }
      el.querySelectorAll('.rx').forEach((b) => b.setAttribute('aria-pressed', b.dataset.e === p.reaction));
      el.hidden = false;
      placePanel(el, trigger);
      panelIn(el);
      trigger.setAttribute('aria-expanded', 'true');
      // Your reaction in view, if it's further down
      const mine = emojiEl.querySelector('.rx[aria-pressed="true"]');
      emojiEl.scrollTop = 0;
      if (mine && mine.offsetTop > emojiEl.clientHeight - 40) mine.scrollIntoView({ block: 'center' });
      if (!still) emojiEl.querySelectorAll('.rx-sec:first-child .rx').forEach((b, n) => b.animate([{ opacity: 0, transform: 'translateY(6px) scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: 60 + n * 22, easing: 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' }));
      // A computer goes straight to the search; a phone waits to be asked, so the keyboard doesn't jump up
      if (!hover) (finePointer ? rxSearch : el).focus({ preventScroll: true });
    }
    function closePicker(returnFocus) {
      if (!openPick) return;
      const { el, trigger } = openPick;
      openPick = null;
      trigger.setAttribute('aria-expanded', 'false');
      if (el.contains(document.activeElement)) document.activeElement.blur();
      panelOut(el);
      if (returnFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
    }
    reactButton.addEventListener('click', () => {
      if (openPick?.trigger === reactButton && !openPick.hover) closePicker(true);
      else openPicker(picker, reactButton);
    });
    let leaveTimer;
    reactButton.addEventListener('pointerenter', (e) => {
      clearTimeout(leaveTimer);
      if (e.pointerType === 'mouse' && openPick?.trigger !== reactButton) openPicker(picker, reactButton, true);
    });
    reactButton.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); openPicker(picker, reactButton); } });
    // Clicking into the search (or anywhere in it) keeps a hover-opened picker open
    picker.addEventListener('pointerdown', () => { if (openPick?.el === picker) openPick.hover = false; });
    picker.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
    for (const el of [reactButton, picker]) el.addEventListener('pointerleave', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(leaveTimer);
      leaveTimer = setTimeout(() => { if (openPick?.hover) closePicker(false); }, 260);
    });
    // Phones: pull a sheet down by its handle to close it
    for (const sheet of [picker, document.getElementById('pbWho')]) {
      const grab = sheet.querySelector('.rx-grab');
      let d = null;
      grab.addEventListener('pointerdown', (e) => { d = { y: e.clientY, t: performance.now(), dy: 0, v: 0 }; grab.setPointerCapture(e.pointerId); sheet.getAnimations().forEach((a) => a.cancel()); });
      grab.addEventListener('pointermove', (e) => {
        if (!d) return;
        const now = performance.now(), dy = Math.max(0, e.clientY - d.y);
        d.v = (dy - d.dy) / Math.max(1, now - d.t); d.dy = dy; d.t = now;
        sheet.style.transform = `translateY(${dy}px)`;
      });
      const end = () => {
        if (!d) return;
        const { dy, v } = d; d = null;
        if (dy > 80 || (v > .5 && dy > 16)) { closePicker(false); return; }
        const from = sheet.style.transform; sheet.style.transform = '';
        if (from && !still) sheet.animate([{ transform: from }, { transform: 'none' }], { duration: 320, easing: SOFT_EASE });
      };
      grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
    }
    // Who reacted: tap a chip to see everyone behind it (and the other emoji, one tab each)
    const pbWho = document.getElementById('pbWho'), whoTabs = document.getElementById('pbWhoTabs'), whoList = document.getElementById('pbWhoList');
    const AV = ['#D9D0EA', '#C6DEDA', '#EBDCCB', '#E6CDD6', '#C9C0E2'];
    const avColor = (name) => AV[[...String(name)].reduce((t, ch) => t + ch.charCodeAt(0), 0) % AV.length];
    const who = { tab: 'all', people: null, req: 0 };
    function paintWho() {
      const p = current();
      if (!p) return;
      const counts = Object.entries(p.reactions || {}).filter(([e, n]) => n > 0 && isEmoji(e)).sort((x, y) => y[1] - x[1]);
      if (!counts.length) { closePicker(true); return; }
      if (who.tab !== 'all' && !counts.some(([e]) => e === who.tab)) who.tab = 'all';
      const tab = (key, label, n) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'rx-who-tab'; b.dataset.tab = key;
        b.setAttribute('aria-pressed', who.tab === key);
        b.setAttribute('aria-label', `${key === 'all' ? 'Everyone' : nameOf(key)}, ${plural(n, 'reaction', 'reactions')}`);
        b.innerHTML = `<span class="e" aria-hidden="true"></span><span aria-hidden="true"></span>`;
        b.firstChild.textContent = label; b.lastChild.textContent = num(n);
        if (key === 'all') b.firstChild.className = '';
        return b;
      };
      whoTabs.replaceChildren(tab('all', 'All', reactTotal(p)), ...counts.map(([e, n]) => tab(e, e, n)));
      if (!who.people) { whoList.innerHTML = '<li><span class="note">Loading…</span></li>'; return; }
      const rows = who.people.filter((r) => who.tab === 'all' || r.emoji === who.tab)
        .sort((x, y) => (y.mine ? 1 : 0) - (x.mine ? 1 : 0));
      if (!rows.length) { whoList.innerHTML = '<li><span class="note">No one yet.</span></li>'; return; }
      whoList.replaceChildren(...rows.map((r) => personRow(r, true)));
    }
    function personRow(r, allowRemove = false) {
        const li = document.createElement('li');
        if (r.mine) li.className = 'is-mine';
        li.innerHTML = '<span class="rx-av" aria-hidden="true"></span><span class="rx-who-text"><span class="rx-name"></span><time class="rx-when"></time></span><span></span><span class="rx-e"></span>';
        const av = li.querySelector('.rx-av'), name = r.mine ? 'You' : r.by;
        av.textContent = (String(name).trim()[0] || '·').toUpperCase(); av.style.setProperty('--c', avColor(name));
        const pic = r.avatarUrl || (r.mine && Momento.account?.get()?.avatarUrl);
        if (pic) { const img = document.createElement('img'); img.src = pic; img.alt = ''; img.referrerPolicy = 'no-referrer'; img.onerror = () => img.remove(); av.append(img); }
        li.querySelector('.rx-name').textContent = name;
        const when = li.querySelector('.rx-when'), said = reactedWhen(r.at);
        if (said) { when.textContent = said; when.dateTime = r.at; when.title = new Date(r.at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' }); } else when.remove();
        const e = li.querySelector('.rx-e'); e.textContent = r.emoji || '♥'; e.setAttribute('aria-label', r.emoji ? nameOf(r.emoji) : 'Like'); e.setAttribute('role', 'img');
        if (allowRemove && r.mine) {
          const undo = document.createElement('button');
          undo.type = 'button'; undo.className = 'rx-undo'; undo.textContent = 'Remove';
          undo.setAttribute('aria-label', 'Remove your reaction');
          undo.addEventListener('click', () => toggleReaction(r.emoji, false));
          li.children[2].replaceWith(undo);
        }
        return li;
    }
    // Who reacted, kept per photo: shown at once when it's opened again, and fetched in the background as soon
    // as you land on a photo with reactions, so the list is usually ready before you tap
    const whoCache = new Map(), whoLoading = new Map();
    function fetchWho(id) {
      if (whoLoading.has(id)) return whoLoading.get(id);
      const job = momentoApi('/api/photos/' + encodeURIComponent(id) + '/reactions')
        .then((r) => { const people = r.people || []; whoCache.set(id, people); return people; })
        .finally(() => whoLoading.delete(id));
      whoLoading.set(id, job);
      return job;
    }
    function prefetchWho(p) { if (p?.id && reactTotal(p) > 0 && !whoCache.has(p.id)) fetchWho(p.id).catch(() => {}); }
    async function loadWho() {
      const p = current();
      if (!p) return;
      const req = ++who.req;
      const cached = whoCache.get(p.id);
      who.people = cached || null; paintWho();
      try {
        const people = await fetchWho(p.id);
        if (req !== who.req || openPick?.el !== pbWho) return;
        if (cached && JSON.stringify(cached) === JSON.stringify(people)) return;   // nothing changed: no repaint
        who.people = people;
      } catch (err) {
        if (req !== who.req || cached) return;
        whoList.replaceChildren(); const li = document.createElement('li'); li.innerHTML = '<span class="note"></span>';
        li.firstChild.textContent = 'Couldn’t load who reacted. ' + err.message; whoList.append(li); return;
      }
      paintWho();
    }
    function openWho(chip) {
      const p = current();
      if (!p) return;
      if (openPick) closePicker(false);
      who.tab = chip.dataset.e;
      openPick = { el: pbWho, trigger: chip, for: p.id };
      chip.setAttribute('aria-expanded', 'true');
      pbWho.hidden = false;
      loadWho();
      placePanel(pbWho, chip, 'start');
      panelIn(pbWho);
      (whoTabs.querySelector('[aria-pressed="true"]') || whoTabs.firstChild)?.focus({ preventScroll: true });
    }
    pbTally.addEventListener('click', (e) => {
      const chip = e.target.closest('.pb-chip');
      if (!chip) return;
      if (openPick?.el === pbWho && who.tab === chip.dataset.e) closePicker(true); else openWho(chip);
    });
    whoTabs.addEventListener('click', (e) => { const b = e.target.closest('.rx-who-tab'); if (!b) return; who.tab = b.dataset.tab; paintWho(); whoTabs.querySelector(`[data-tab="${CSS.escape(who.tab)}"]`)?.focus(); });
    // A tap anywhere else closes it (and that tap doesn't also open or close the photo)
    document.addEventListener('pointerdown', (e) => {
      if (!openPick || openPick.el.contains(e.target) || openPick.trigger.contains(e.target) || (openPick.el === pbWho && e.target.closest?.('.pb-chip'))) return;
      closePicker(false); dismissedAt = performance.now();
    }, true);
    // Esc closes the row first, before the album or the viewer
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && openPick) { e.preventDefault(); e.stopPropagation(); closePicker(true); }
    }, true);
    viewer.addEventListener('close', () => { closePicker(false); [picker, pbWho].forEach((el) => { el.hidden = true; el.style.transform = ''; }); viewer.classList.remove('has-sheet'); });
    async function toggleReaction(emoji, fromPicker) {
      const p = current();
      if (!p || reactBusy || !isEmoji(emoji)) return;
      reactBusy = true;
      whoCache.delete(p.id);   // your own reaction changes who's on the list
      const before = { reactions: { ...(p.reactions || {}) }, reaction: p.reaction || null };
      const want = before.reaction === emoji ? null : emoji, next = { ...before.reactions };
      if (before.reaction) { next[before.reaction] = Math.max(0, (next[before.reaction] || 1) - 1); if (!next[before.reaction]) delete next[before.reaction]; }
      if (want) next[want] = (next[want] || 0) + 1;
      p.reactions = next; p.reaction = want;
      M.coverDirty = true;   // a reaction counts towards the cover too
      renderSocial();
      if (want && !still) {
        document.getElementById('vwFace').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45) rotate(-8deg)' }, { transform: 'scale(1)' }], { duration: 460, easing: 'cubic-bezier(.34, 1.56, .64, 1)' });
      }
      try {
        const r = await momentoApi('/api/photos/' + encodeURIComponent(p.id) + '/reaction', momentoJson('POST', { emoji: want }));
        p.reactions = r.reactions || {}; p.reaction = r.reaction || null;
      } catch (err) { Object.assign(p, before); Momento.toast('That didn’t go through', err.message); }
      finally { reactBusy = false; if (current() === p) renderSocial(); }
      if (openPick?.el === pbWho && current() === p) loadWho();
    }
    // A new album opens with the emoji row closed; when one closes, covers catch up with any new likes
    albumModal.addEventListener('close', () => {
      closePicker(false);
      if (M.coverDirty) { M.coverDirty = false; loadAlbums().catch(() => {}); }
      // A photo may have been bookmarked or un-bookmarked inside the album: Bookmarked catches up
      if (filter === 'liked') loadLiked();
    });

    // ---- Recently deleted ----
    // Photos you delete wait here for 30 days, and can be brought back. The second tab lists the photos you hid
    // from your own view. Opened from the button next to search (everything), or from an album's ⋯ menu (just that album)
    const binModal = document.getElementById('binModal'), binCard = binModal.querySelector('.bin-card');
    const binBody = document.getElementById('binBody'), binBar = document.getElementById('binBar'), binSelBar = document.getElementById('binSelBar');
    const binHead = document.getElementById('binHead'), binSelHead = document.getElementById('binSelHead');
    const binEmpty = document.getElementById('binEmpty'), binPeek = document.getElementById('binPeek');
    const binTabs = [...binModal.querySelectorAll('.bin-seg button')];
    const BIN = { tab: 'deleted', album: null, photos: [], busy: false, opener: null };
    const binCounts = { trash: 0, hidden: 0 };
    const binBtn = document.getElementById('binOpen'), binBadge = document.getElementById('binBadge');
    // The numbers on the toolbar button come with the album list
    function updateBinBadge() {
      const n = binCounts.trash;
      binBadge.textContent = n > 99 ? '99+' : String(n);
      binBadge.hidden = !n;
      binBtn.setAttribute('aria-label', n ? `Recently deleted, ${plural(n, 'photo', 'photos')}` : 'Recently deleted');
    }
    const binSel = makeSelect(binBody, () => syncBin());
    binSel.open = (t) => peekBin(t.dataset.id);
    const binDays = (p) => Math.max(1, Math.ceil((new Date(p.purgeAt) - Date.now()) / 864e5));
    function binSvg(d) { return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`; }
    const BIN_ICON = {
      back: binSvg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5"/>'),
      bin: binSvg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
      eye: binSvg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
    };
    async function loadBin() {
      const q = BIN.album ? '?album=' + encodeURIComponent(BIN.album) : '';
      const [gone, hid] = await Promise.all([momentoApi('/api/trash' + q), momentoApi('/api/hidden' + q)]);
      BIN.deleted = gone.photos || []; BIN.hiddenList = hid.photos || [];
      BIN.photos = BIN.tab === 'deleted' ? BIN.deleted : BIN.hiddenList;
    }
    function paintBin() {
      const deleted = BIN.tab === 'deleted', list = BIN.photos;
      binTabs[0].hidden = !canRecover();
      binTabs.forEach((t) => t.setAttribute('aria-selected', t.dataset.tab === BIN.tab));
      binTabs[0].querySelector('small').textContent = BIN.deleted?.length || '';
      binTabs[1].querySelector('small').textContent = BIN.hiddenList?.length || '';
      const where = BIN.album ? byId(BIN.album)?.name : '';
      document.getElementById('binTitle').textContent = where ? where : canRecover() ? 'Recently deleted' : 'Hidden by you';
      document.getElementById('binSub').textContent = deleted
        ? 'Photos you delete stay here for 30 days, then they’re deleted for good.'
        : 'Only you stop seeing these. Everyone else in the album still does.';
      // The photos, a heading per album
      const groups = new Map();
      for (const p of list) (groups.get(p.albumId) || groups.set(p.albumId, { name: p.albumName, items: [] }).get(p.albumId)).items.push(p);
      const heads = !BIN.album && groups.size > 0;
      binBody.innerHTML = [...groups.values()].map((g) => `${heads ? `<h3 class="bin-album">${esc(g.name)}</h3>` : ''}
        <div class="ab-grid">${g.items.map((p) => `<button class="ab-tile" type="button" data-id="${esc(p.id)}" aria-label="Photo from ${esc(g.name)}${deleted ? `, deleted ${binDays(p) === 1 ? 'today' : 'with ' + plural(binDays(p), 'day', 'days') + ' left'}` : ''}"><img ${smallImg(p)} alt="" loading="lazy" decoding="async">${deleted ? `<span class="bin-days${binDays(p) <= 3 ? ' is-soon' : ''}">${plural(binDays(p), 'day', 'days')}</span>` : ''}<span class="ab-check" aria-hidden="true"></span></button>`).join('')}</div>`).join('');
      binEmpty.hidden = list.length > 0;
      binEmpty.querySelector('b').textContent = deleted ? 'Nothing here' : 'Nothing hidden';
      binEmpty.querySelector('span').textContent = deleted ? 'Photos you delete stay here for 30 days.' : 'Photos you hide from an album show up here.';
      document.getElementById('binSelect').hidden = !list.length;
      // The bottom bar, for this tab
      const word = BIN.album ? '' : ' all';
      binBar.hidden = binSel.on || !list.length;
      binBar.innerHTML = deleted
        ? `<button class="ab-act is-primary" type="button" data-act="recover-all">Recover${word}</button><button class="ab-act is-danger" type="button" data-act="purge-all">Delete${word}</button>`
        : `<button class="ab-act is-primary" type="button" data-act="show-all">Show${word} again</button>`;
      binSel.paint();
    }
    function syncBin() {
      const on = binSel.on, wasOn = !binSelHead.hidden, n = binSel.ids.size, deleted = BIN.tab === 'deleted';
      binHead.hidden = on; binSelHead.hidden = !on; binSelBar.hidden = !on; binBar.hidden = on || !BIN.photos.length;
      document.getElementById('binCount').textContent = n ? `${plural(n, 'photo', 'photos')} selected` : 'Select photos';
      document.getElementById('binAll').textContent = n && n === BIN.photos.length ? 'Deselect all' : 'Select all';
      binSelBar.innerHTML = deleted
        ? `<button class="ab-tool" type="button" data-act="recover"${n ? '' : ' disabled'}>${BIN_ICON.back}<span>Recover</span></button><button class="ab-tool is-danger" type="button" data-act="purge"${n ? '' : ' disabled'}>${BIN_ICON.bin}<span>Delete forever</span></button>`
        : `<button class="ab-tool" type="button" data-act="show"${n ? '' : ' disabled'}>${BIN_ICON.eye}<span>Show again</span></button>`;
      if (on && !wasOn && binModal.open) document.getElementById('binCancel').focus({ preventScroll: true });
    }
    // Only the host of an album can delete (and so recover) its photos
    const canRecover = () => (BIN.album ? byId(BIN.album)?.role === 'host' : ALBUMS.some((a) => a.role === 'host'));
    async function openBin({ album = null, tab = 'deleted' } = {}) {
      BIN.album = album; BIN.opener = document.activeElement;
      BIN.tab = canRecover() ? tab : 'hidden';
      binPeek.hidden = true; binSel.stop();
      try { await loadBin(); } catch (err) { Momento.toast('Couldn’t open Recently deleted', err.message); return; }
      paintBin();
      if (!binModal.open) { showModal(binModal); cardIn(binCard); }
      binModal.querySelector('.album-scroll').scrollTop = 0;
    }
    async function closeBin() { if (binModal.open) await softClose(binModal, binCard); }
    pullToClose(binCard, document.getElementById('binScroll'), closeBin, () => binSel.on || !binPeek.hidden);
    binModal.addEventListener('close', () => {
      binCard.getAnimations().forEach((a) => a.cancel());
      binSel.stop(); binPeek.hidden = true;
      if (useCursor && !albumModal.open) root.classList.add('has-cursor');
      binBtn.isConnected && BIN.opener === binBtn && binBtn.focus({ preventScroll: true });
    });
    binModal.addEventListener('cancel', (e) => { e.preventDefault(); if (!binPeek.hidden) binPeek.hidden = true; else if (binSel.on) binSel.stop(); else closeBin(); });
    binModal.addEventListener('pointerdown', (e) => { binModal._downOutside = e.target === binModal; });
    binModal.addEventListener('click', (e) => { if (e.target === binModal && binModal._downOutside) closeBin(); });
    binModal.querySelector('[data-close]').addEventListener('click', closeBin);
    binBtn.addEventListener('click', () => openBin());
    document.getElementById('binSelect').addEventListener('click', () => binSel.start());
    document.getElementById('binCancel').addEventListener('click', () => { binSel.stop(); document.getElementById('binSelect').focus({ preventScroll: true }); });
    document.getElementById('binAll').addEventListener('click', () => binSel.all());
    binTabs.forEach((t) => t.addEventListener('click', () => { if (BIN.tab === t.dataset.tab) return; BIN.tab = t.dataset.tab; BIN.photos = BIN.tab === 'deleted' ? BIN.deleted : BIN.hiddenList; binSel.stop(); paintBin(); }));
    // A tap on a photo (outside Select): look at it bigger, with its own buttons
    function peekBin(id) {
      const p = BIN.photos.find((x) => x.id === id);
      if (!p) return;
      document.getElementById('binPeekImg').src = p.url || p.thumbnailUrl;
      document.getElementById('binPeekBar').innerHTML = BIN.tab === 'deleted'
        ? `<button class="ab-act" type="button" data-act="back">Back</button><button class="ab-act is-primary" type="button" data-act="recover-one" data-id="${esc(id)}">Recover</button><button class="ab-act is-solid" type="button" data-act="purge-one" data-id="${esc(id)}">Delete forever</button>`
        : `<button class="ab-act" type="button" data-act="back">Back</button><button class="ab-act is-primary" type="button" data-act="show-one" data-id="${esc(id)}">Show again</button>`;
      binPeek.hidden = false;
      binPeek.querySelector('button')?.focus({ preventScroll: true });
    }
    // What Recover, Delete forever and Show again do (for some photos, or for all of them)
    async function binAct(act, ids) {
      if (BIN.busy) return;
      const everything = act.endsWith('-all'), n = everything ? BIN.photos.length : ids.length;
      if (!n) return;
      const scope = BIN.album ? { album: BIN.album } : {};
      if (act === 'purge' || act === 'purge-all' || act === 'purge-one') {
        const title = everything ? `Delete ${n === 1 ? 'this photo' : `all ${n} photos`} for good?` : n === 1 ? 'Delete this photo for good?' : `Delete ${n} photos for good?`;
        if (!await Momento.confirm({ from: binModal.querySelector(`[data-act="${act}"]`), title, body: 'You won’t be able to get them back.', ok: everything ? 'Delete all' : 'Delete forever' })) return;
      }
      BIN.busy = true;
      try {
        if (act.startsWith('recover')) await momentoApi('/api/trash/restore', momentoJson('POST', everything ? { all: true, ...scope } : { photoIds: ids }));
        else if (act.startsWith('purge')) await momentoApi('/api/trash/purge', momentoJson('POST', everything ? { all: true, ...scope } : { photoIds: ids }));
        else {
          // Show again: one request per album
          const by = new Map();
          for (const p of BIN.photos) if (everything || ids.includes(p.id)) (by.get(p.albumId) || by.set(p.albumId, []).get(p.albumId)).push(p.id);
          for (const [albumId, photoIds] of by) {
            await momentoApi('/api/albums/' + albumId + '/hidden', momentoJson('POST', { photoIds, hidden: false }));
            try { localStorage.removeItem('momento-kept-' + albumId); } catch (err) {}
          }
        }
      } catch (err) { BIN.busy = false; Momento.toast('That didn’t go through', err.message); return; }
      BIN.busy = false;
      binPeek.hidden = true; binSel.stop();
      const what = plural(n, 'photo', 'photos');
      try { await loadBin(); await loadAlbums(); if (M.a && albumModal.open) { await fetchAlbum(M.a); photosChanged(M.a, M.i); } } catch (err) { Momento.toast('Couldn’t refresh', err.message); }
      paintBin();
      if (act.startsWith('recover')) Momento.toast(n === 1 ? 'Photo recovered' : `${n} photos recovered`, 'Back in their albums.');
      else if (act.startsWith('purge')) Momento.toast(n === 1 ? 'Photo deleted for good' : `${n} photos deleted for good`, '', { danger: true });
      else Momento.toast(n === 1 ? 'Photo shown again' : `${n} photos shown again`, 'Back in the album for you.');
      return what;
    }
    binModal.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      const act = b.dataset.act;
      if (act === 'back') { binPeek.hidden = true; return; }
      if (act.endsWith('-one')) return binAct(act, [b.dataset.id]);
      binAct(act, [...binSel.ids]);
    });

    // ---- Join an album using the server-issued guest code ----

    document.getElementById('albumQr').addEventListener('click', (e) => { if (M.a?.code) Momento.qr?.show(M.a, e.currentTarget); });
    // ---- Albums come and go: created or joined here, deleted or left, or brought back with Undo ----
    function refreshCard(a) {
      if (!cards.has(a.id)) return null;   // the live album has no card in the archive
      const old = cards.get(a.id), el = makeCard(a, ARCHIVE.indexOf(a));
      el.classList.add('is-in');
      if (old) old.replaceWith(el);
      cards.set(a.id, el);
      return el;
    }
    function focusCard(id) {
      const el = cards.get(id);
      if (!el || !el.isConnected) return;
      el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
      if (!still) el.animate([{ transform: 'scale(.94)', opacity: .4 }, { transform: 'scale(1.02)', opacity: 1, offset: .6 }, { transform: 'none' }], { duration: 900, delay: 300, easing: 'cubic-bezier(.34, 1.4, .64, 1)' });
    }
    document.addEventListener('momento:albums', async (e) => {
      if (e.detail.type === 'remove' && M.a?.id === e.detail.id && albumModal.open) await closeAlbum();
      try { await loadAlbums(); } catch (err) { Momento.toast('Could not refresh albums', err.message); }
      // Settings changed the open album's name, date or place: repaint its window
      if (e.detail.type === 'update' && albumModal.open && M.a && M.a.id === e.detail.album?.id) {
        const fresh = byId(M.a.id);
        if (fresh) { M.a = fresh; document.getElementById('albumTitle').textContent = fresh.name; fillAlbum(fresh); }
      }
    });
    document.addEventListener('momento:open-album', async (e) => {
      if (!byId(e.detail)) {
        try { await loadAlbums(); } catch (err) { Momento.toast('Could not open album', err.message); return; }
      }
      const a = byId(e.detail);
      if (!a || a.gone) return;
      if (filter !== 'all' || query) { search.value = query = ''; filter = 'all'; tabs.forEach((x) => x.setAttribute('aria-selected', x.dataset.filter === 'all')); placePill(); render(false); }
      focusCard(a.id);
      setTimeout(() => openAlbum(a.id, 0, cards.get(a.id)?.img || null), still ? 0 : 750);
    });
    // Arriving from "View album" on another page: albums.html#album=<id>
    // From a notification about new photos it also names them: #album=<id>&photos=<id,id,…>&by=<who added them>,
    // and the album opens showing just those (see applyFocus)
    const albumFromHash = () => {
      if (!/^#album=/.test(location.hash)) return;
      const q = new URLSearchParams(location.hash.slice(1)), id = q.get('album');
      history.replaceState(null, '', location.pathname + location.search);
      if (!id) return;
      const photos = (q.get('photos') || '').split(',').filter(Boolean);
      pendingFocus = photos.length ? { album: id, photos, by: q.get('by') || '' } : null;
      document.dispatchEvent(new CustomEvent('momento:open-album', { detail: id }));
    };
    addEventListener('hashchange', albumFromHash);

    fx.lightExisting(); // (the glass already on the page; the rest lights up as the pointer reaches it)

    fx.rollExisting();

    placePill();
    render(false);
    document.querySelectorAll('.pulse .head').forEach((h) => reveal.observe(h));
    const header = document.getElementById('header');
    const veil = () => header.classList.toggle('is-veiled', scrollY > 40);
    addEventListener('scroll', veil, { passive: true });
    veil();

    // ---- Opening: headline rises, then the totals count up ----
    // (after the page intro, when there is one: it lifts the veil by announcing momento:intro-reveal)
    const open = () => {
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-ready')));
      setTimeout(() => {
        const els = document.querySelectorAll('[data-count]');
        const t0 = performance.now(), dur = still ? 0 : 1600;
        const tick = (now) => {
          const p = dur ? Math.min((now - t0) / dur, 1) : 1;
          els.forEach((el) => { el.textContent = num(Math.round(+el.dataset.count * easeOut(p))); });
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, still ? 0 : 600);
    };
    if (root.classList.contains('intro-on')) document.addEventListener('momento:intro-reveal', open, { once: true });
    else open();

    // ---- Scroll effects: the section rules draw themselves ----
    function updateScroll() {
      for (const head of document.querySelectorAll('.pulse .head')) {
        const r = head.getBoundingClientRect();
        head.querySelector('.rule').style.transform = `scaleX(${easeOut(clamp((vh * .95 - r.top) / (vh * .55), 0, 1)).toFixed(4)})`;
      }
    }

    let checkTimer;
    function showChecks(a, checks) {
      if (M.a && M.a.id !== a.id && albumModal.open) return;
      clearTimeout(checkTimer);
      const box = document.getElementById('albumChecks');
      // Each of your photos still on its way: "IMG_204.jpg · Declined" with Request review, and so on
      const labels = {
        checking: 'Checking…', publish: 'Passed: adding it to the album…', review: 'Waiting for our team (within 1–2 working days)',
        rejected: 'Declined', failed: 'Couldn’t be read: try another copy of this photo',
      };
      box.replaceChildren(...checks.map(check => {
        const line = document.createElement('li');
        line.className = 'check is-' + check.state;
        line.innerHTML = '<span class="check-dot" aria-hidden="true"></span><span class="check-text"><span class="check-name"></span><span class="check-state"></span></span>';
        line.querySelector('.check-name').textContent = check.name;
        line.querySelector('.check-name').title = check.name;
        line.querySelector('.check-state').textContent = check.state === 'rejected'
          ? (check.reviewed ? 'Declined by our team' : check.explicit ? 'Declined: it looks like nudity' : 'Needs a review: our check wasn’t sure')
          : labels[check.state] || check.state;
        if (check.state === 'rejected' && !check.reviewed && !check.explicit) line.classList.add('is-unsure');
        // Only a photo the check was unsure about can be sent to our team
        if (check.state === 'rejected' && !check.reviewed && !check.explicit) {
          const appeal = document.createElement('button');
          appeal.type = 'button'; appeal.className = 'check-act'; appeal.textContent = 'Request review';
          appeal.setAttribute('aria-label', 'Request review of ' + check.name);
          appeal.addEventListener('click', async () => {
            appeal.disabled = true; appeal.textContent = 'Sending…';
            try {
              const r = await momentoApi('/api/auth/moderation/' + check.id + '/review', momentoJson('POST', {}));
              Momento.toast('Review requested', r.message || 'A staff member will look at it.');
              await fetchAlbum(a);
            } catch (error) { Momento.toast('Review request', error.message); appeal.disabled = false; appeal.textContent = 'Request review'; }
          });
          line.append(appeal);
        }
        // A declined or unreadable upload can be removed from the list (deleted at once)
        if (check.state === 'rejected' || check.state === 'failed') {
          const remove = document.createElement('button');
          remove.type = 'button'; remove.className = 'check-x';
          remove.setAttribute('aria-label', 'Remove ' + check.name);
          remove.title = 'Remove';
          remove.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
          remove.addEventListener('click', async () => {
            remove.disabled = true;
            try { await momentoApi('/api/albums/' + a.id + '/checks/' + check.id, { method: 'DELETE' }); await fetchAlbum(a); }
            catch (error) { Momento.toast('Couldn’t remove it', error.message); remove.disabled = false; }
          });
          line.append(remove);
        }
        return line;
      }));
      box.hidden = !checks.length;
      if (!checks.some(c => ['checking', 'publish', 'review'].includes(c.state))) return;
      const poll = async () => {
        if (!albumModal.open || M.a?.id !== a.id) return;
        if (document.hidden || viewer.open) { checkTimer = setTimeout(poll, 5000); return; }
        try {
          const { checks: current } = await momentoApi('/api/albums/' + a.id + '/checks');
          if (!albumModal.open || M.a?.id !== a.id) return;
          if (JSON.stringify(checks) !== JSON.stringify(current)) {
            await fetchAlbum(a);
            if (albumModal.open && M.a?.id === a.id && !viewer.open) photosChanged(a, 0);
          } else showChecks(a, current);
        } catch { checkTimer = setTimeout(poll, 15000); }
      };
      checkTimer = setTimeout(poll, checks.some(c => c.state !== 'review') ? 4000 : 60000);
    }
    async function fetchAlbum(a) {
      const result = await momentoApi('/api/albums/' + a.id);
      Object.assign(a, fromStore(result.album));
      a.photoItems = result.photos;
      showChecks(a, result.checks || []);
      a.pics = result.photos.map((p) => p.thumbnailUrl || p.url + '?size=thumb');
      sortPhotos(a);   // in the order chosen on this device (the server's order is kept on each photo)
    }
    async function loadAlbums() {
      // Until the email is confirmed the server refuses the list (403), and the confirm-your-email popup
      // covers the page anyway: wait for the session check and don't ask
      const me = await Momento.sessionReady?.catch?.(() => null);
      if (me && !me.emailVerified) return;
      const result = await momentoApi('/api/albums');
      cards.clear();
      const updated = result.albums.map((item) => Object.assign(byId(item.id) || {}, fromStore(item)));
      ALBUMS.splice(0, ALBUMS.length, ...updated);
      albumsLoaded = true;
      ALBUMS.forEach((a, i) => cards.set(a.id, makeCard(a, i)));
      render(false); sumUp(false); renderLive();
      yearsEl.classList.remove('is-loading');
      document.querySelector('#empty > span').textContent = ALBUMS.length ? 'Try another name or place.' : 'Your event and group albums will appear here.';
      renderFeed(result);
      renderTodo(result);
      // The host's activity count rides along with the list: keep the open album's bell in step with it
      if (M.a && albumModal.open) { paintPulse(M.a); if (!pulseEl.hidden) loadPulse(); }
      binCounts.trash = result.trashCount || 0; binCounts.hidden = result.hiddenCount || 0;
      updateBinBadge();
    }

    // ---- Waiting on you: invites, plus what your albums need from you right now ----
    const TODO_MAX = 5;
    let todos = [];
    const initialTile = (name) => `<span class="todo-initial" aria-hidden="true">${esc((name.trim()[0] || '·').toUpperCase())}</span>`;
    const coverTile = (a) => (coverPic(a) ? `<img src="${esc(pic(coverPic(a), 120, 120))}" alt="" loading="lazy" decoding="async">` : initialTile(a.name));
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    function renderTodo(result) {
      // (Invitations to join live on the Events page; this page only shows albums you're already in)
      todos = [];
      const list = kept();
      // Happening now and you haven't added anything yet
      for (const a of list) if (a.status === 'live' && a.open !== false && !a.mine) todos.push({
        kind: 'live', id: a.id, pic: coverTile(a), title: `${a.name} is live`,
        note: a.photos ? `${plural(a.photos, 'photo', 'photos')} so far, none from you yet. Add yours while it’s happening.` : 'Nobody has added photos yet. Be the first.',
        act: 'Add photos', run: () => openAlbum(a.id, 0, null, true),
      });
      // Closing within a week: last chance to add or download
      for (const a of list) if (a.status === 'wrapping' && a.closes && closesIn(a) <= 7) todos.push({
        kind: 'closing', id: a.id, pic: coverTile(a), title: `${a.name} closes ${inDays(closesIn(a))}`,
        note: a.photos ? `Download all ${plural(a.photos, 'photo', 'photos')} before it’s archived.` : 'Add your photos before it’s archived.',
        act: a.photos ? 'Download' : 'Add photos',
        run: () => (a.photos ? (location.href = window.MOMENTO_API + '/api/albums/' + a.id + '/download') : openAlbum(a.id, 0, null, true)),
      });
      // Albums you host: guests to nudge, or nobody invited yet
      for (const a of list) {
        if (a.role !== 'host' || a.open === false || !a.code) continue;
        if (a.waiting > 0) todos.push({
          kind: 'remind', id: a.id, pic: coverTile(a), title: `${plural(a.waiting, 'guest hasn’t', 'guests haven’t')} added photos to ${a.name}`,
          note: 'You’re hosting it. A reminder email usually brings a few more in.', act: 'Send a reminder', light: true,
          run: async (btn) => {
            btn.disabled = true; btn.textContent = 'Sending…';
            try {
              await momentoApi('/api/albums/' + a.id + '/remind', { method: 'POST' });
              btn.textContent = 'Reminder sent'; btn.closest('.todo-row').classList.add('is-done');
              Momento.toast('Reminder sent', `To the ${plural(a.waiting, 'guest', 'guests')} who haven’t added photos to ${a.name}`);
            } catch (err) { btn.disabled = false; btn.textContent = 'Send a reminder'; Momento.toast('Reminder not sent', err.message); }
          },
        });
        else if (a.guests <= 1) todos.push({
          kind: 'share', id: a.id, pic: coverTile(a), title: `Invite people to ${a.name}`,
          note: `Nobody else has joined yet. Send the link, or share the code ${a.code}.`, act: 'Copy link', light: true,
          run: async (btn) => {
            if (await copyText(Momento.inviteLink?.(a.code) || albumLinkFor(a))) { btn.textContent = 'Link copied'; setTimeout(() => { btn.textContent = 'Copy link'; }, 1800); }
            else Momento.toast('Copy this link', Momento.inviteLink?.(a.code) || albumLinkFor(a));
          },
        });
      }
      todos = todos.slice(0, TODO_MAX);
      const row = (t, i) => `
        <li class="todo-row" data-kind="${t.kind}">
          <span class="todo-pic">${t.pic}</span>
          <span class="todo-text"><b>${esc(t.title)}</b><small>${esc(t.note)}</small></span>
          <button class="todo-act${t.light ? ' is-light' : ''}" type="button" data-todo="${i}">${esc(t.act)}</button>
        </li>`;
      // Only real to-dos are shown. With none, there's no block at all (every album is in the list below);
      // with no albums yet, the block is the way to make the first one
      const quiet = !todos.length && list.length > 0;
      document.querySelector('.pulse').classList.toggle('is-quiet', quiet);
      todoEl.innerHTML = todos.length ? todos.map(row).join('') : quiet ? '' : `
        <li class="todo-empty">
          <b>No albums yet</b>
          <p>Create an album for your event, or join one with its code. Reminders and albums about to close show up here.</p>
          <span class="todo-empty-acts"><button class="todo-act" type="button" data-empty="create">Create an album</button></span>
        </li>`;
    }
    todoEl.addEventListener('click', (e) => {
      const b = e.target.closest('.todo-act');
      if (!b || b.disabled) return;
      if (b.dataset.empty === 'create') return Momento.createAlbum?.(b);
      todos[+b.dataset.todo]?.run(b);
    });

    // ---- Just added: who added how many photos to which album, newest first ----
    const FACE = ['#D9D0EA', '#E6CDD6', '#C6DEDA', '#EBDCCB'];
    const tint = (s) => FACE[[...s].reduce((h, c) => h + c.charCodeAt(0), 0) % FACE.length];
    const FEED_SHOWN = 4;
    function agoText(t) {
      const s = (Date.now() - new Date(t)) / 1000;
      if (!(s >= 0)) return '';
      if (s < 45) return 'just now';
      const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
      const h = Math.round(m / 60); if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
      const d = Math.round(h / 24); if (d === 1) return 'yesterday';
      return d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    }
    function burstHTML(b, a, hide) {
      const shown = b.pics.slice(0, 4), extra = b.n - shown.length, who = b.by || 'Someone';
      return `
        <article class="burst" data-id="${esc(a.id)}"${hide ? ' hidden' : ''}>
          <span class="burst-av" style="background:${tint(who)}" aria-hidden="true">${esc(who[0].toUpperCase())}</span>
          <div>
            <p class="burst-line"><b>${esc(who)}</b> added ${b.n} ${b.n === 1 ? 'photo' : 'photos'} to <button class="burst-album" type="button">${esc(a.name)}</button></p>
            <div class="burst-time">${a.status === 'live' ? '<i aria-hidden="true"></i>' : ''}<span>${esc(agoText(b.at))}</span></div>
            <div class="burst-thumbs" style="--n:${shown.length}">${shown.map((src, j) => `<button class="bt" type="button" data-src="${esc(src)}" aria-label="Open photo ${j + 1} from ${esc(who)} in ${esc(a.name)}"><img src="${esc(src)}" alt="" loading="lazy" decoding="async">${extra > 0 && j === shown.length - 1 ? `<span class="bt-more" aria-hidden="true">+${extra}</span>` : ''}</button>`).join('')}</div>
          </div>
        </article>`;
    }
    let feedNewest = 0;
    const activitySeen = () => { try { return +localStorage.getItem('momento.activitySeen') || 0; } catch { return 0; } };
    const paintActivityDot = () => { document.getElementById('activityDot').hidden = !(feedNewest > activitySeen() && Date.now() - feedNewest < 864e5); };
    function renderFeed(result) {
      // Batches from the server; an older server only sends single photos, so those become batches of one
      const list = (result.feed || (result.recent || []).map((p) => ({ albumId: p.albumId, by: p.by, n: 1, pics: [p.thumbnailUrl || p.url], at: p.at })))
        .filter((b) => byId(b.albumId) && b.pics?.length);
      // A small dot on the button when someone else added photos in the last day that you haven't looked at yet
      // (your own uploads never light it; opening Just added clears it)
      feedNewest = list.filter((b) => b.by !== 'You' && !b.mine).reduce((t, b) => Math.max(t, +new Date(b.at) || 0), 0);
      paintActivityDot();
      if (!list.length) { feedEl.innerHTML = '<p class="feed-empty">No photos yet. When anyone adds photos to your albums, you’ll see who added what here.</p>'; return; }
      const more = list.length - FEED_SHOWN;
      feedEl.innerHTML = list.map((b, i) => burstHTML(b, byId(b.albumId), i >= FEED_SHOWN)).join('')
        + (more > 0 ? `<button class="feed-more" type="button" aria-expanded="false">Show ${more} more</button>` : '');
    }
    // The feed lives in a sheet opened from the toolbar; picking a photo or album closes it and opens that album
    const activityModal = document.getElementById('activityModal'), activityCard = activityModal.querySelector('.activity-card');
    const closeActivity = () => softClose(activityModal, activityCard);
    pullToClose(activityCard, activityCard.querySelector('.album-scroll'), closeActivity);
    document.getElementById('activityOpen').addEventListener('click', () => {
      try { localStorage.setItem('momento.activitySeen', String(Math.max(Date.now(), feedNewest))); } catch {}
      paintActivityDot();
      showModal(activityModal);
      cardIn(activityCard);
      activityModal.querySelector('.album-scroll').scrollTop = 0;
    });
    activityModal.querySelector('[data-close]').addEventListener('click', closeActivity);
    activityModal.addEventListener('cancel', (e) => { e.preventDefault(); closeActivity(); });
    activityModal.addEventListener('pointerdown', (e) => { activityModal._downOutside = e.target === activityModal; });
    activityModal.addEventListener('click', (e) => { if (e.target === activityModal && activityModal._downOutside) closeActivity(); });
    activityModal.addEventListener('close', () => { activityCard.getAnimations().forEach((a) => a.cancel()); if (useCursor && !albumModal.open) root.classList.add('has-cursor'); });
    feedEl.addEventListener('click', (e) => {
      const moreBtn = e.target.closest('.feed-more');
      if (moreBtn) { feedEl.querySelectorAll('.burst[hidden]').forEach((b) => { b.hidden = false; }); moreBtn.remove(); return; }
      const row = e.target.closest('.burst');
      if (!row) return;
      const thumb = e.target.closest('.bt');
      const go = (...args) => { activityModal.close(); openAlbum(...args); };
      if (thumb) go(row.dataset.id, thumb.dataset.src, thumb.querySelector('img'));
      else if (e.target.closest('.burst-album')) go(row.dataset.id, 0, row.querySelector('.bt img'));
    });

    // ---- Host activity on public albums ----
    // Anyone can join a public album, so the host isn't asked. Instead a bell in the album window lists who joined,
    // who left and who added photos. It never pops up: a small count on the bell and a dot on the album's card, and
    // closing the list marks it read. Turn it off per album (Mute) or for every album (Settings > Notifications).
    const pulseEl = document.getElementById('abPulse'), pulseBell = document.getElementById('abBell'), pulsePip = document.getElementById('abBellPip');
    const pulseList = document.getElementById('pulseList'), pulseRead = document.getElementById('pulseRead'), pulseMute = document.getElementById('pulseMute');
    const P = { items: [], seenAt: '', for: '' };   // the rows on screen, and which album they belong to
    function pulseOn(a) { return !!a && a.role === 'host' && a.visibility === 'public'; }
    // Settings can turn the dots off for good (the account's notify.activity switch)
    function pulseCount(a) {
      if (!pulseOn(a) || a.muteActivity || window.Momento?.account?.get?.()?.notify?.activity === false) return 0;
      return a.unread || 0;
    }
    // The dot on the album's card, next to "You're hosting"
    function pipHtml(a) {
      const n = pulseCount(a);
      return n ? `<span class="new-pip" title="${n} new in activity"><i aria-hidden="true"></i><span class="sr">, ${n} new</span></span>` : '';
    }
    function paintCardPip(a) {
      const role = cards.get(a.id)?.querySelector('.role');
      if (!role) return;
      role.querySelector('.new-pip')?.remove();
      role.insertAdjacentHTML('beforeend', pipHtml(a));
    }
    function paintPulse(a) {
      const on = pulseOn(a);
      pulseBell.hidden = !on;
      document.getElementById('abHead').classList.toggle('has-bell', on);
      if (!on) { closePulse(); return; }
      const n = pulseCount(a);
      pulsePip.hidden = !n; pulsePip.textContent = n > 9 ? '9+' : String(n);
      pulseBell.setAttribute('aria-label', n ? `Activity, ${n} new` : 'Activity');
      pulseMute.textContent = a.muteActivity ? 'Unmute this album' : 'Mute this album';
    }
    // "Tom Okafor joined", "Tom, Noor, Theo and 2 others joined", "Sam Reid added 8 photos"
    function pulseText(x) {
      // A photo row is one uploader (n counts photos), so it keeps the full name; join and leave rows name up to
      // three people by first name when there are several
      const several = x.type !== 'photos' && (x.people.length > 1 || x.n > 1);
      const first = x.people.map((p) => (several ? p.name.split(' ')[0] : p.name));
      let who = first[0] || 'Someone';
      if (x.type !== 'photos') {
        const rest = Math.max(0, x.n - first.length);
        who = rest ? `${first.join(', ')} and ${rest} ${rest === 1 ? 'other' : 'others'}` : first.length > 1 ? `${first.slice(0, -1).join(', ')} and ${first.at(-1)}` : who;
      }
      const verb = x.type === 'joined' ? 'joined' : x.type === 'left' ? 'left' : `added ${x.n} ${x.n === 1 ? 'photo' : 'photos'}`;
      return `<b>${esc(who)}</b> ${verb}`;
    }
    function renderPulse() {
      const items = [...P.items].sort((x, y) => String(y.at).localeCompare(String(x.at)));
      const fresh = items.filter((x) => x.at > P.seenAt), older = items.filter((x) => x.at <= P.seenAt);
      pulseRead.disabled = !fresh.length;
      if (!items.length) { pulseList.innerHTML = '<p class="pulse-empty">Nothing yet. Guests who join, and photos they add, will show up here.</p>'; return; }
      const row = (x, isNew) => `<div class="pulse-row${isNew ? ' is-new' : ''}"><span class="pulse-av" style="background:${tint(x.people[0]?.name || '?')}" aria-hidden="true">${esc((x.people[0]?.name || '?')[0].toUpperCase())}</span><p class="pulse-line">${pulseText(x)}${isNew ? '<span class="sr"> (new)</span>' : ''}</p><span class="pulse-time">${esc(agoText(x.at))}</span></div>`;
      pulseList.innerHTML = (fresh.length ? '<p class="pulse-group">New</p>' + fresh.map((x) => row(x, true)).join('') : '')
        + (older.length ? (fresh.length ? '<p class="pulse-group">Earlier</p>' : '') + older.map((x) => row(x, false)).join('') : '');
    }
    async function loadPulse() {
      const a = M.a;
      if (!pulseOn(a)) return;
      try {
        const r = await momentoApi('/api/albums/' + a.id + '/activity');
        if (M.a !== a) return;
        P.items = r.items || []; P.seenAt = r.seenAt || ''; P.for = a.id;
        a.unread = r.unread ?? a.unread;
        paintPulse(a); paintCardPip(a);
        if (!pulseEl.hidden) renderPulse();
      } catch (err) {
        if (!pulseEl.hidden && P.for !== a.id) pulseList.innerHTML = '<p class="pulse-empty">Couldn’t load the activity. Try again in a moment.</p>';
      }
    }
    // Everything so far has been seen: the count clears at once, the server catches up behind it
    async function markPulseSeen(id = P.for) {
      const a = byId(id);
      if (!pulseOn(a) || !a.unread) return;
      const was = a.unread;
      // Only what was on screen counts as seen: anything that arrived since the last load stays new
      const upTo = P.for === a.id && P.items.length ? P.items.reduce((t, x) => (x.at > t ? x.at : t), '') : undefined;
      a.unread = 0; paintPulse(a); paintCardPip(a);
      if (upTo) { P.seenAt = upTo; if (!pulseEl.hidden) renderPulse(); }
      try {
        const r = await momentoApi('/api/albums/' + a.id + '/activity/seen', momentoJson('POST', upTo ? { upTo } : {}));
        if (P.for === a.id && r.seenAt) P.seenAt = r.seenAt;
        if (r.unread) { a.unread = r.unread; paintPulse(a); paintCardPip(a); }
      } catch (err) { a.unread = was; paintPulse(a); paintCardPip(a); }
    }
    function openPulse() {
      if (!pulseOn(M.a)) return;
      closeMenu();
      pulseEl.hidden = false; pulseBell.setAttribute('aria-expanded', 'true');
      pulseEl.dataset.album = M.a.id;
      if (!still) pulseEl.animate([{ opacity: 0, transform: 'translateY(-6px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      if (P.for === M.a.id) renderPulse(); else pulseList.innerHTML = '<p class="pulse-empty">Loading…</p>';
      pulseEl.focus({ preventScroll: true });
      loadPulse();
    }
    function closePulse(refocus) {
      if (pulseEl.hidden) return;
      const id = pulseEl.dataset.album;
      pulseEl.hidden = true; pulseBell.setAttribute('aria-expanded', 'false');
      if (refocus) pulseBell.focus({ preventScroll: true });
      markPulseSeen(id);
    }
    pulseBell.addEventListener('click', () => (pulseEl.hidden ? openPulse() : closePulse(true)));
    pulseRead.addEventListener('click', () => markPulseSeen(pulseEl.dataset.album));
    pulseEl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePulse(true); } });
    pulseEl.addEventListener('focusout', (e) => { if (e.relatedTarget && !pulseEl.contains(e.relatedTarget) && e.relatedTarget !== pulseBell) closePulse(); });
    document.addEventListener('pointerdown', (e) => { if (!pulseEl.hidden && !pulseEl.contains(e.target) && !pulseBell.contains(e.target)) closePulse(); }, true);
    pulseMute.addEventListener('click', async () => {
      const a = M.a;
      if (!pulseOn(a)) return;
      const want = !a.muteActivity;
      pulseMute.disabled = true;
      try {
        const r = await momentoApi('/api/albums/' + a.id, momentoJson('PATCH', { muteActivity: want }));
        a.muteActivity = r.album?.muteActivity ?? want;
        a.unread = r.album?.unread ?? (want ? 0 : a.unread);
        paintPulse(a); paintCardPip(a);
        Momento.toast(want ? 'Activity muted' : 'Activity is back on', a.name);
      } catch (err) { Momento.toast('Couldn’t change that', err.message); }
      pulseMute.disabled = false;
    });
    // While the album is open, look for new activity once a minute (and when the tab comes back into view)
    const pulseRefresh = () => { if (!document.hidden && albumModal.open && pulseOn(M.a)) loadPulse(); };
    setInterval(pulseRefresh, 60000);
    document.addEventListener('visibilitychange', pulseRefresh);

    const PENDING_JOIN = 'momento-pending-join';
    // Embedded in another page (see the top of <head>): that page shows this album window over itself
    const embedded = root.classList.contains('is-embed');
    const tellParent = (state, message) => { try { parent.postMessage({ type: 'momento:album', state, message }, location.origin); } catch (e) {} };
    if (embedded) albumModal.addEventListener('close', () => setTimeout(() => { if (!albumModal.open) tellParent('closed'); }, 0));
    document.addEventListener('DOMContentLoaded', async () => {
      const lede = document.getElementById('lede');
      lede.textContent = 'Loading your albums…';
      document.getElementById('empty').hidden = true;
      try {
        const user = await Momento.sessionReady;
        const params = new URLSearchParams(location.search);
        if (!user) {
          // Not logged in: a welcome with the ways in. Logging in is asked for only when they act
          if (embedded) { tellParent('failed', 'Log in to see this album.'); return; }
          lede.textContent = 'Every event you’re part of, in one place.';
          document.querySelector('.pulse').hidden = true;
          document.querySelector('.tools').parentElement.hidden = true;
          const live = document.getElementById('live');
          live.classList.add('is-guest');
          live.innerHTML = `<div class="guest-in">
            <h2 id="liveTitle">Your albums will live here</h2>
            <p>Join an album with its code or QR code, find a public event near you, or create one for your own event. You’ll log in or sign up when you’re ready.</p>
            <div class="guest-acts">
              <a class="btn btn-dark" href="events#join">Join with a code</a>
              <button class="btn btn-light" type="button" data-create>Create an album</button>
              <a class="btn btn-light" href="events#events">Events near you</a>
            </div>
          </div>`;
          live.querySelectorAll('.btn').forEach((b) => rollButton?.(b));
          liveSettle(true);
          if (params.get('join')) location.replace('events?join=' + encodeURIComponent(params.get('join')));
          return;
        }
        if (!user.emailVerified) {
          // The confirm-your-email popup (assets/guard.js) covers the page; nothing loads behind it
          lede.textContent = 'Confirm your email to view albums and upload photos.';
          liveSettle(false);
          document.querySelector('.pulse').hidden = true;
          document.querySelector('.tools').parentElement.hidden = true;
          // Opened inside another page: say so, so that page doesn't wait for an album that will never show
          if (embedded) tellParent('failed', 'Confirm your email to view albums.');
          return;
        }
        await loadAlbums();
        // An invite link opened before logging in or confirming the email (kept for a week)
        let pending = null;
        try { pending = JSON.parse(localStorage.getItem(PENDING_JOIN) || 'null'); localStorage.removeItem(PENDING_JOIN); } catch (e) {}
        const joinCode = params.get('join') || (pending && Date.now() - pending.at < 7 * 864e5 ? pending.code : '');
        if (params.get('verified') === '1' && user.emailVerified) {
          Momento.toast('Your email is verified ✨', 'Welcome to Momento! Your lovely moments start here.');
          params.delete('verified');
          history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '') + location.hash);
        }
        if (embedded) {
          // Inside another page: open the one album, tell that page, and close with it. From a notification
          // about new photos it also names them (photos=<id,id>&by=<who>): the album opens showing just those
          const focusPhotos = (params.get('photos') || '').split(',').filter(Boolean);
          if (params.get('album') && focusPhotos.length) pendingFocus = { album: params.get('album'), photos: focusPhotos, by: params.get('by') || '' };
          if (params.get('album')) await openAlbum(params.get('album'), 0, null, params.has('upload'));
          tellParent(albumModal.open ? 'ready' : 'closed');
          return;
        }
        if (params.get('album')) {
          await openAlbum(params.get('album'));
          // Reloaded with a photo open: open it again
          const ph = params.get('photo'), at = ph ? (M.a?.photoItems || []).findIndex((x) => x.id === ph) : -1;
          if (albumModal.open && at >= 0) openPhoto(at, thumbsEl.children[at]?.querySelector('img'));
        }
        else if (joinCode) location.replace('events?join=' + encodeURIComponent(joinCode));
        else albumFromHash();
      } catch (err) {
        lede.textContent = 'Could not load your albums. ' + err.message + ' Reload to try again.';
        liveSettle(false);
        // Opened inside another page: tell it, so it shows the problem instead of waiting for ever
        if (embedded) tellParent('failed', err.message);
      }
    });

    // ---- One loop for everything that moves (shared), plus the scroll effects when the page has scrolled ----
    let lastScroll = -1;
    fx.loop(() => { if (scrollY !== lastScroll) { lastScroll = scrollY; updateScroll(); } });
    updateScroll();
}
