/* Event games on the album page.
   - The arcade strip at the top of an event album (#abArcade): the games that are live (with their clocks), the latest
     winner, and who's top of the event, so games are part of the album rather than a button in the corner.
   - The Games button in the album's header and the Games window: every game, the leaderboards (points, and games
     won), one game to play, and, for the host, a form to make a game (with an optional time limit) and the buttons
     to run it.
   - The celebration: when a game finishes (its time ran out or the host ended it), everyone with the album open sees
     the winners with confetti, once per game on this device.
   Talks to /api/albums/:id/games (API_CONTRACT.md). While the Games window is open it asks every pollEveryMs (3 s);
   while only the album is open, every few seconds when a game is live (so a clock running out is seen at once) and
   every 20 s otherwise. albums.js tells it which album is open (the momento:album event) and lends it the album's
   photos (window.momentoAlbum). Games are only in events whose host left them on (the album's games setting). */
/* eslint-disable */

// Each game has its own colour and symbol (the colours read on both themes; text on them is always dark ink)
const TYPES = {
  poll: { name: 'Poll', blurb: 'Everyone votes on one question.', color: '#3BA4F5', icon: '📊' },
  trivia: { name: 'Quiz', blurb: 'Timed questions; quick right answers score more.', color: '#FFB020', icon: '🧠' },
  battle: { name: 'Photo battle', blurb: 'Guests enter photos and vote between two at a time.', color: '#FF5A5F', icon: '⚔️' },
  bingo: { name: 'Scavenger bingo', blurb: 'Fill a card of prompts with your own photos.', color: '#2FCB8E', icon: '🎯' },
  crop: { name: 'Mystery crop', blurb: 'Guess the event photo from a close-up.', color: '#9B6BFF', icon: '🔍' },
  contest: { name: 'Photo competition', blurb: 'Guests upload entries; you pick the winners.', color: '#FF4FA3', icon: '📸' },
};
const STATUS = { draft: 'Not started', live: 'Live', ended: 'Finished' };
// Games that can have a time limit (gameService TIMED_TYPES)
const TIMED = new Set(['poll', 'battle', 'bingo']);
const LIMITS = [2, 5, 10, 15, 30, 60, 120];
const CONFETTI = ['#3BA4F5', '#FFB020', '#FF5A5F', '#2FCB8E', '#9B6BFF', '#FF4FA3', '#FFC83D'];
// A finished game is celebrated if it ended this recently (someone opening the album an hour later isn't showered)
const CHEER_MS = 15 * 60000;
const CHEERED_KEY = 'momento-games-cheered';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isEvent = (a) => !!a && (a.kind ? a.kind === 'event' : !!a.startsAt);
const toast = (title, msg) => (window.Momento?.toast ? window.Momento.toast(title, msg) : console.warn(title, msg));
const medal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;
const MEDAL_ICON = { 1: '🥇', 2: '🥈', 3: '🥉' };
const typeOf = (r) => TYPES[r?.type] || { name: r?.type || 'Game', color: '#9B6BFF', icon: '🎮' };
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
// "4:05 left", "1 h 20 min left", "12 s left"
function timeLeft(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 3600) { const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return `${h} h${m ? ` ${m} min` : ''}`; }
  if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return `${s} s`;
}
const limitText = (m) => (m < 60 ? `${m} minutes` : `${m / 60} hour${m === 60 ? '' : 's'}`);
// "Shreyash", "Shreyash and Fairooz", "Shreyash, Fairooz and Hamza"
const names = (list) => (list.length < 2 ? list[0] || '' : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
// The site's own question window (Shell.tsx: translated, styled), or the browser's as a fallback
const ask = (o) => (window.Momento?.confirm ? window.Momento.confirm({ danger: true, ...o }) : Promise.resolve(window.confirm([o.title, o.body].filter(Boolean).join('\n\n'))));

export default function installGames() {
  const btn = document.getElementById('abGames');
  const modal = document.getElementById('gamesModal');
  const body = document.getElementById('gmBody');
  const title = document.getElementById('gmTitle');
  const back = document.getElementById('gmBack');
  const strip = document.getElementById('abArcade');
  const albumModal = document.getElementById('albumModal');
  if (!btn || !modal || !body) return;

  // view: list | round | new | pick      board: which leaderboard shows (points | wins)
  const G = { album: null, data: null, view: 'list', round: null, newType: 'poll', pair: null, pairFor: null, pairNote: '', pick: null, timer: 0, ticker: 0,
    html: '', busy: false, board: 'points', stripTimer: 0, stripTicker: 0, stripHtml: '', cheering: false, queue: [] };
  const api = (path, opts) => window.momentoApi(`/api/albums/${encodeURIComponent(G.album.id)}/games${path}`, opts);
  const json = (method, b) => window.momentoJson(method, b);
  const roundOf = (id) => G.data?.rounds.find((r) => r.id === id) || null;
  const myPhotos = () => ((window.momentoAlbum?.() || G.album)?.photoItems || []).filter((p) => p.mine);

  // ---- Games celebrated on this device (each finished game once) ----
  const cheered = (() => { try { return new Set(JSON.parse(localStorage.getItem(CHEERED_KEY) || '[]')); } catch { return new Set(); } })();
  const markCheered = (id) => {
    cheered.add(id);
    try { localStorage.setItem(CHEERED_KEY, JSON.stringify([...cheered].slice(-200))); } catch {}
  };

  // ---- New data from the server (the window's polling, the strip's, or after an action) ----
  function took(d) {
    G.data = d;
    const live = d.rounds.some((r) => r.status === 'live');
    btn.classList.toggle('is-live', live);
    paintStrip();
    findCheers(d);
  }

  // ---- The Games button and the strip: only in events with games on ----
  function hideGames() {
    btn.hidden = true; btn.classList.remove('is-live');
    if (strip) { strip.hidden = true; strip.innerHTML = ''; G.stripHtml = ''; }
    stopStrip();
  }
  async function loadAlbum(a) {
    G.album = a; G.data = null; G.stripHtml = '';
    hideGames();
    if (!isEvent(a) || a.games === false) return;
    btn.hidden = false;
    try {
      const d = await api('');
      if (G.album !== a) return;
      if (!d.enabled) { hideGames(); return; }
      // Games already finished when the album opens were seen (or missed) before: only ones that end from now on, or
      // in the last few minutes, are celebrated
      took(d);
      startStrip();
      // From a "You won" notification: straight to that game
      const pending = window.momentoPendingGame;
      if (pending && pending.album === a.id) {
        window.momentoPendingGame = null;
        if (roundOf(pending.game)) openWindow(pending.game);
      }
    } catch {}
  }
  document.addEventListener('momento:album', (e) => loadAlbum(e.detail));
  // The host turned games on or off in Album settings
  document.addEventListener('momento:games-setting', (e) => {
    if (!G.album || e.detail?.album !== G.album.id) return;
    G.album = { ...G.album, games: e.detail.on };
    if (!e.detail.on && modal.open) close();
    loadAlbum(G.album);
  });
  albumModal?.addEventListener('close', () => { stopStrip(); if (modal.open) close(); });

  function openWindow(roundId) {
    if (!G.album) return;
    G.view = roundId ? 'round' : 'list'; G.round = roundId || null; G.html = '';
    G.pair = null; G.pairFor = null; G.pairNote = '';
    if (G.data) paint();
    else body.innerHTML = '<p class="gm-empty">Loading games…</p>';
    if (!modal.open) modal.showModal();
    refresh();
  }
  btn.addEventListener('click', () => openWindow());
  const close = () => { clearTimeout(G.timer); clearInterval(G.ticker); modal.close(); };
  modal.querySelector('[data-gm-close]').addEventListener('click', close);
  modal.addEventListener('close', () => { clearTimeout(G.timer); clearInterval(G.ticker); startStrip(); });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  back.addEventListener('click', () => {
    if (G.view === 'pick') { G.pick = null; G.view = 'round'; }
    else { G.view = 'list'; G.round = null; }
    G.html = ''; paint();
  });

  // ---- Asking the server, every pollEveryMs while the window is open ----
  async function refresh() {
    clearTimeout(G.timer);
    if (!modal.open || !G.album) return;
    if (!document.hidden) {
      try {
        const d = await api('');
        if (!d.enabled) { close(); hideGames(); return; }
        took(d);
        if (G.view === 'list' || G.view === 'round') paint();
      } catch (err) {
        if (!G.data) body.innerHTML = `<p class="gm-empty">${esc(err.message)}</p>`;
      }
    }
    G.timer = setTimeout(refresh, G.data?.pollEveryMs || 3000);
  }
  // A host or player action: show its answer at once, then keep polling
  async function act(fn, after) {
    if (G.busy) return;
    G.busy = true; body.classList.add('is-busy');
    try {
      const r = await fn();
      took(await api(''));
      if (after) await after(r);
      G.html = '';
      paint();
      // The server shares one copy of the games for up to 2 seconds, so look again just after it renews
      clearTimeout(G.timer);
      G.timer = setTimeout(refresh, 2100);
    } catch (err) { toast('Games', err.message); }
    finally { G.busy = false; body.classList.remove('is-busy'); }
  }

  // ---- The strip's own polling, while the album is open and the Games window isn't ----
  function startStrip() {
    stopStrip();
    if (!G.album || !G.data?.enabled || !albumModal?.open) return;
    const live = G.data.rounds.filter((r) => r.status === 'live');
    // A clock about to run out: look just after it does. Something live: every 5 s. Nothing: every 20 s
    const soonest = Math.min(...live.filter((r) => r.endsAt).map((r) => new Date(r.endsAt).getTime() - Date.now()), Infinity);
    const wait = soonest < 20000 ? Math.max(1500, soonest + 1200) : live.length ? 5000 : 20000;
    G.stripTimer = setTimeout(async () => {
      if (modal.open || !albumModal.open || !G.album) return;
      if (!document.hidden) {
        const a = G.album;
        try { const d = await api(''); if (G.album !== a) return; if (!d.enabled) { hideGames(); return; } took(d); } catch {}
      }
      startStrip();
    }, wait);
  }
  function stopStrip() { clearTimeout(G.stripTimer); }

  // ---- The arcade strip at the top of the album ----
  function paintStrip() {
    if (!strip) return;
    const d = G.data;
    if (!d?.enabled) { strip.hidden = true; return; }
    const live = d.rounds.filter((r) => r.status === 'live');
    const lastWin = d.rounds.filter((r) => r.status === 'ended' && r.results?.some((p) => p.place === 1))
      .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))[0];
    const cards = live.map((r) => {
      const t = typeOf(r);
      return `<button class="arc-game" type="button" data-arc-open="${esc(r.id)}" style="--gc:${t.color}">
        <span class="arc-ic" aria-hidden="true">${t.icon}</span>
        <span class="arc-txt"><small>${esc(t.name)}</small><b>${esc(r.title || t.name)}</b>
          <em>${r.endsAt ? `<span class="arc-clock" data-arc-ends="${esc(r.endsAt)}">${timeLeft(new Date(r.endsAt) - Date.now())}</span> left` : '<i class="arc-pulse" aria-hidden="true"></i>Live now'}</em></span>
        <span class="arc-go">Play</span></button>`;
    });
    if (!live.length) {
      if (lastWin) {
        const winners = lastWin.results.filter((p) => p.place === 1).map((p) => p.name);
        cards.push(`<button class="arc-game is-won" type="button" data-arc-open="${esc(lastWin.id)}" style="--gc:#FFC83D">
          <span class="arc-ic" aria-hidden="true">🏆</span>
          <span class="arc-txt"><small>Latest winner</small><b>${esc(lastWin.iWon ? 'You won!' : `${names(winners)} won`)}</b><em>${esc(lastWin.title)}</em></span>
          <span class="arc-go">See results</span></button>`);
      }
      cards.push(d.host
        ? `<button class="arc-game is-new" type="button" data-arc-new style="--gc:#9B6BFF">
            <span class="arc-ic" aria-hidden="true">🎲</span>
            <span class="arc-txt"><small>Games</small><b>${d.rounds.length ? 'Start another game' : 'Start a game'}</b><em>Polls, quizzes, photo battles and more</em></span>
            <span class="arc-go">New game</span></button>`
        : !lastWin ? `<div class="arc-game is-quiet" style="--gc:#9B6BFF"><span class="arc-ic" aria-hidden="true">🎲</span>
            <span class="arc-txt"><small>Games</small><b>No game running</b><em>When the host starts one it shows up here</em></span></div>` : '');
    }
    // Top of the table: game wins first, else points
    const top = (d.winsBoard?.length ? d.winsBoard.map((x) => ({ ...x, score: plural(x.wins, 'win', 'wins') })) : d.leaderboard.map((x) => ({ ...x, score: `${x.points} pts` }))).slice(0, 3);
    const board = top.length ? `<button class="arc-board" type="button" data-arc-board aria-label="Leaderboard">
        <span class="arc-board-head">Leaderboard</span>
        <ol>${top.map((x) => `<li class="${x.mine ? 'is-mine' : ''}"><span aria-hidden="true">${MEDAL_ICON[x.rank] || x.rank}</span><b>${esc(x.mine ? 'You' : x.name)}</b><em>${esc(x.score)}</em></li>`).join('')}</ol>
      </button>` : '';
    const html = `<div class="arc-row">${cards.join('')}${board}</div>`;
    strip.hidden = false;
    if (html !== G.stripHtml) { G.stripHtml = html; strip.innerHTML = html; }
    clearInterval(G.stripTicker);
    if (strip.querySelector('[data-arc-ends]')) { G.stripTicker = setInterval(tickStrip, 1000); tickStrip(); }
  }
  function tickStrip() {
    for (const el of strip.querySelectorAll('[data-arc-ends]')) el.textContent = timeLeft(new Date(el.dataset.arcEnds) - Date.now());
  }
  strip?.addEventListener('click', (e) => {
    const t = e.target.closest('[data-arc-open], [data-arc-new], [data-arc-board]');
    if (!t) return;
    if (t.dataset.arcOpen) openWindow(t.dataset.arcOpen);
    else if (t.dataset.arcNew !== undefined) { openWindow(); G.view = 'new'; G.html = ''; paint(); }
    else { G.board = G.data?.winsBoard?.length ? 'wins' : 'points'; openWindow(); }
  });

  // ---- Painting: the html is only swapped when it changed, so a poll doesn't disturb taps or the crop picture ----
  function paint() {
    const r = G.view === 'round' || G.view === 'pick' ? roundOf(G.round) : null;
    if ((G.view === 'round' || G.view === 'pick') && !r) { G.view = 'list'; G.round = null; }
    back.hidden = G.view === 'list';
    title.textContent = G.view === 'new' ? 'New game' : r ? r.title || typeOf(r).name : 'Games';
    modal.querySelector('.gm-card')?.style.setProperty('--gc', r ? typeOf(r).color : G.view === 'new' ? typeOf({ type: G.newType }).color : '#9B6BFF');
    const html = G.view === 'new' ? newForm() : G.view === 'pick' ? picker() : r ? roundView(r) : listView();
    if (html === G.html) return;
    const oldImg = body.querySelector('img.gm-crop-img');
    G.html = html;
    body.innerHTML = html;
    const newImg = body.querySelector('img.gm-crop-img');
    if (oldImg && newImg && oldImg.getAttribute('src') === newImg.getAttribute('src')) newImg.replaceWith(oldImg);
    if (G.view === 'new') wireForm();
    tick();
    clearInterval(G.ticker);
    if (body.querySelector('[data-ends]')) G.ticker = setInterval(tick, 250);
  }
  // Countdowns: a quiz question's seconds, a timed game's time left (and a fresh look when either runs out)
  function tick() {
    for (const el of body.querySelectorAll('[data-ends]')) {
      const ms = new Date(el.dataset.ends).getTime() - Date.now();
      el.textContent = ms > 0 ? (el.dataset.long ? `${timeLeft(ms)} left` : `${Math.ceil(ms / 1000)} s`) : 'Time’s up';
      el.classList.toggle('is-close', ms > 0 && ms <= 10000);
      if (ms <= 0 && !el.dataset.done) { el.dataset.done = '1'; setTimeout(() => { G.html = ''; refresh(); }, 600); }
    }
  }

  // ---- The list: you, the games (live first), and the leaderboards ----
  function gameCard(r) {
    const t = typeOf(r);
    let line;
    if (r.status === 'live') line = r.endsAt ? `<span data-ends="${esc(r.endsAt)}" data-long="1"></span>` : '<i class="gm-pulse" aria-hidden="true"></i>Live now';
    else if (r.status === 'draft') line = r.minutes ? `Runs ${limitText(r.minutes)} once started` : r.untilEventEnds ? 'Runs until the event ends' : 'Not started yet';
    else {
      const w = (r.results || []).filter((p) => p.place === 1);
      line = r.iWon ? '🏆 You won' : w.length ? `🏆 ${esc(names(w.map((p) => p.name)))} won` : 'Finished';
    }
    const go = r.status === 'live' ? 'Play' : r.status === 'draft' ? 'Set up' : 'Results';
    return `<li><button class="gm-game is-${r.status}" type="button" data-open="${esc(r.id)}" style="--gc:${t.color}">
      <span class="gm-ic" aria-hidden="true">${t.icon}</span>
      <span class="gm-gtext"><small>${esc(t.name)}</small><b>${esc(r.title || t.name)}</b><em>${line}</em></span>
      <span class="gm-go">${go}</span></button></li>`;
  }
  function listView() {
    const d = G.data;
    if (!d) return '<p class="gm-empty">Loading games…</p>';
    const live = d.rounds.filter((r) => r.status === 'live');
    const drafts = d.host ? d.rounds.filter((r) => r.status === 'draft') : [];
    const done = d.rounds.filter((r) => r.status === 'ended').sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt));
    const group = (head, list) => (list.length ? `<section class="gm-group"><h3>${head}</h3><ul class="gm-list">${list.map(gameCard).join('')}</ul></section>` : '');
    const none = !d.rounds.length || (!d.host && !live.length && !done.length);
    return `<div class="gm-me">
        <span class="gm-stat" style="--gc:#FFB020"><b>${d.myPoints}</b><small>${d.myPoints === 1 ? 'point' : 'points'}</small></span>
        <span class="gm-stat" style="--gc:#FFC83D"><b>${d.myWins || 0}</b><small>${(d.myWins || 0) === 1 ? 'game won' : 'games won'}</small></span>
        ${d.host ? '<button class="gm-main gm-new" type="button" data-new>New game</button>' : ''}
      </div>
      ${none ? `<p class="gm-empty"><span class="gm-empty-ic" aria-hidden="true">🎲</span>${d.host ? 'No games yet. Make one for your guests to play.' : 'No games yet. The host will start one soon.'}</p>` : ''}
      ${group('Playing now', live)}${group('Ready to start', drafts)}${group('Finished', done)}
      ${boardView(d)}`;
  }
  // Two leaderboards: points from every game, and games won. The top 3 stand on a podium (2nd, 1st, 3rd)
  function boardView(d) {
    const wins = G.board === 'wins';
    const rows = wins ? (d.winsBoard || []).map((x) => ({ ...x, score: x.wins, unit: x.wins === 1 ? 'win' : 'wins' }))
      : d.leaderboard.map((x) => ({ ...x, score: x.points, unit: 'pts' }));
    const tabs = `<div class="gm-tabs" role="tablist" aria-label="Leaderboard">
      <button type="button" role="tab" data-board="points" aria-selected="${!wins}">Points</button>
      <button type="button" role="tab" data-board="wins" aria-selected="${wins}">Games won</button></div>`;
    if (!rows.length) return `<section class="gm-section gm-boardsec"><div class="gm-board-head"><h3>Leaderboard</h3>${tabs}</div>
      <p class="gm-hint">${wins ? 'Win a game and your name goes up here.' : 'Points from every game appear here.'}</p></section>`;
    const who = (x) => esc(x.mine ? 'You' : x.name);
    const podium = [rows[1], rows[0], rows[2]].map((x, i) => (x ? `<li class="gm-step is-p${x.rank <= 3 ? x.rank : 3} ${x.mine ? 'is-mine' : ''}" style="--h:${[70, 100, 52][i]}%">
        <span class="gm-step-medal" aria-hidden="true">${MEDAL_ICON[x.rank] || x.rank}</span><b>${who(x)}</b><em>${x.score} ${x.unit}</em><i aria-hidden="true">${x.rank}</i></li>` : '<li class="gm-step is-empty" aria-hidden="true"></li>')).join('');
    const rest = rows.slice(3);
    return `<section class="gm-section gm-boardsec"><div class="gm-board-head"><h3>Leaderboard</h3>${tabs}</div>
      <ol class="gm-podium-board" aria-label="Top 3">${podium}</ol>
      ${rest.length ? `<ol class="gm-board" start="4">${rest.map((x) => `<li class="${x.mine ? 'is-mine' : ''}"><span>${x.rank}</span><b>${who(x)}</b><em>${x.score} ${x.unit}</em></li>`).join('')}</ol>` : ''}</section>`;
  }

  // ---- One game ----
  function roundView(r) {
    const host = G.data.host;
    const t = typeOf(r);
    const clock = r.status === 'live' && r.endsAt ? `<span class="gm-timer" data-ends="${esc(r.endsAt)}" data-long="1"></span>` : '';
    const head = `<div class="gm-hero" style="--gc:${t.color}">
        <span class="gm-ic is-big" aria-hidden="true">${t.icon}</span>
        <span class="gm-hero-txt"><small>${esc(t.name)}</small><span class="gm-status is-${r.status}">${r.status === 'live' ? '<i class="gm-pulse" aria-hidden="true"></i>' : ''}${STATUS[r.status]}</span></span>
        ${clock}</div>`;
    let main = '';
    if (r.type === 'poll') main = pollView(r);
    else if (r.type === 'trivia' || r.type === 'crop') main = quizView(r, host);
    else if (r.type === 'battle') main = battleView(r);
    else if (r.type === 'bingo') main = bingoView(r, host);
    else if (r.type === 'contest') main = contestView(r, host);
    return head + resultsView(r) + main + (host ? hostBar(r) : '');
  }
  // A finished game's winners, on a podium, at the top of the game
  function resultsView(r) {
    if (r.status !== 'ended' || !r.results?.length) return '';
    const byPlace = [2, 1, 3].map((p) => r.results.filter((x) => x.place === p));
    return `<section class="gm-results${r.iWon ? ' is-me' : ''}">
      <h3>${r.iWon ? 'You won this one! 🎉' : 'Winners'}</h3>
      <ol class="gm-podium-board">${byPlace.map((list, i) => (list.length ? `<li class="gm-step is-p${[2, 1, 3][i]} ${list.some((x) => x.mine) ? 'is-mine' : ''}" style="--h:${[70, 100, 52][i]}%">
        <span class="gm-step-medal" aria-hidden="true">${MEDAL_ICON[[2, 1, 3][i]]}</span><b>${esc(names(list.map((x) => x.name)))}</b><em>${list[0].points} pts</em><i aria-hidden="true">${[2, 1, 3][i]}</i></li>`
        : '<li class="gm-step is-empty" aria-hidden="true"></li>')).join('')}</ol>
      <button class="gm-link" type="button" data-replay="${esc(r.id)}">Celebrate again 🎊</button></section>`;
  }
  function hostBar(r) {
    const b = [];
    if (r.status === 'draft') b.push(`<button class="gm-main" type="button" data-host="start">Start game${r.minutes ? ` · ${limitText(r.minutes)}` : ''}</button>`);
    if (r.status === 'live') {
      if ((r.type === 'trivia' || r.type === 'crop')) b.push(`<button class="gm-main" type="button" data-host="next">${r.current != null && r.current + 1 >= r.questionCount ? 'Finish' : 'Next question'}</button>`);
      if (r.type === 'contest' && r.phase === 'entries') b.push('<button class="gm-main" type="button" data-host="shortlist">Close entries and pick finalists</button>');
      b.push(`<button class="gm-ghost" type="button" data-host="end">${r.type === 'poll' ? 'End poll' : 'End game and crown winners'}</button>`);
    }
    b.push('<button class="gm-ghost gm-danger" type="button" data-host="delete">Delete game</button>');
    return `<div class="gm-hostbar"><span>Host controls</span>${b.join('')}</div>`;
  }

  function pollView(r) {
    const live = r.status === 'live';
    const best = Math.max(0, ...r.options.map((o) => o.votes));
    return `<p class="gm-q">${esc(r.question)}</p>
      <div class="gm-opts">${r.options.map((o, i) => `
        <button class="gm-opt gm-bar ${r.myChoice === o.id ? 'is-mine' : ''} ${!live && best && o.votes === best ? 'is-right' : ''}" type="button" data-vote="${esc(o.id)}" ${live ? '' : 'disabled'} style="--p:${o.percent}%;--oc:${CONFETTI[i % CONFETTI.length]}">
          <span>${esc(o.text)}</span><em>${r.myChoice != null || !live ? `${o.percent}%` : ''}</em></button>`).join('')}</div>
      <p class="gm-hint">${plural(r.total, 'vote', 'votes')}${live ? ` · ${r.myChoice != null ? 'You can change your vote.' : 'Tap an answer to vote.'}` : ''}</p>`;
  }

  function quizView(r, host) {
    const crop = r.type === 'crop';
    const many = r.questionCount === 1 ? (crop ? '1 photo' : '1 question') : `${r.questionCount} ${crop ? 'photos' : 'questions'}`;
    if (r.status === 'draft') return `<p class="gm-empty">${many}. Waiting for the host to start.</p>${host && r.questions ? hostQuestions(r) : ''}`;
    if (r.status === 'ended' || !r.question) return `<p class="gm-empty">${r.status === 'ended' ? 'Finished.' : 'Waiting for the next question…'}</p><p class="gm-score">Your score in this game <b>${r.myScore}</b></p>`;
    const q = r.question, mine = r.myAnswer, revealed = q.answer !== undefined;
    const pic = crop ? `<figure class="gm-crop"><img class="gm-crop-img" src="${esc(revealed && q.thumbnailUrl ? q.url : q.image)}" alt="${revealed ? 'The whole photo' : 'A close-up of an event photo'}">
      ${!revealed ? `<figcaption>Zoom ${q.stage + 1} of ${q.stages} · ${q.points} points now</figcaption>` : ''}</figure>` : '';
    const letters = ['A', 'B', 'C', 'D'];
    return `<div class="gm-qhead"><span class="gm-qnum">${crop ? 'Photo' : 'Question'} ${q.index + 1}<small>/${r.questionCount}</small></span><span class="gm-clock" ${revealed ? '' : `data-ends="${esc(q.endsAt)}"`}>${revealed ? 'Time’s up' : ''}</span></div>
      ${pic}<p class="gm-q">${esc(q.text)}</p>
      <div class="gm-opts is-quiz">${q.options.map((o, i) => {
        const cls = [mine?.option === i && 'is-mine', revealed && i === q.answer && 'is-right', revealed && mine?.option === i && i !== q.answer && 'is-wrong'].filter(Boolean).join(' ');
        return `<button class="gm-opt ${cls}" type="button" data-answer="${i}" data-q="${q.index}" style="--oc:${CONFETTI[i]}" ${mine || revealed ? 'disabled' : ''}><i class="gm-letter" aria-hidden="true">${letters[i]}</i><span>${esc(o)}</span></button>`;
      }).join('')}</div>
      <p class="gm-hint">${mine ? (revealed ? (mine.correct ? `Right! +${mine.points} points` : 'Not this time.') : 'Answer locked in.') : (revealed ? 'You didn’t answer this one.' : 'Pick an answer.')}</p>
      <p class="gm-score">${plural(q.answers, 'answer', 'answers')} so far · your score <b>${r.myScore}</b></p>`;
  }
  function hostQuestions(r) {
    return `<details class="gm-details"><summary>Questions and answers (only you see these)</summary><ol>${r.questions.map((q) => `<li>${esc(q.text)} <b>${esc(q.options?.[q.answer] ?? '')}</b></li>`).join('')}</ol></details>`;
  }

  function battleView(r) {
    const live = r.status === 'live';
    const mine = r.standings.filter((e) => e.mine);
    let vote = '';
    if (live && r.canVote) {
      if (G.pair && G.pairFor === r.id) vote = `<h3 class="gm-vs-head">Which is better?</h3><div class="gm-pair">${G.pair.map((p, i) => `
        <button class="gm-pick${G.picked === p.photo ? ' is-picked' : ''}" type="button" data-pick="${esc(p.photo)}" data-lose="${esc(G.pair[1 - i].photo)}" ${G.picked ? 'disabled' : ''}><img src="${esc(p.thumbnailUrl || p.url)}" alt="Photo ${i + 1}"></button>`).join('<span class="gm-vs" aria-hidden="true">VS</span>')}</div>`;
      else vote = `<p class="gm-hint">${esc(G.pairFor === r.id && G.pairNote || '')}</p><button class="gm-main" type="button" data-pair>Vote on photos</button>`;
    } else if (live) vote = '<p class="gm-hint">Voting opens when at least two photos from other people are in.</p>';
    const enter = live && r.canEnter ? `<button class="gm-main gm-add" type="button" data-enter><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg>Enter one of your photos (${mine.length}/${r.maxEntries})</button>` : '';
    const standings = r.standings.length ? `<ol class="gm-standings">${r.standings.map((e) => `<li class="${e.mine ? 'is-mine' : ''}">
        <span>${e.place ? MEDAL_ICON[e.place] || medal(e.place) : e.rank}</span><img src="${esc(e.thumbnailUrl || e.url)}" alt=""><b>${esc(e.by)}</b><em>${e.wins}–${e.losses}</em>
        ${e.mine && live ? `<button class="gm-x" type="button" data-withdraw="${esc(e.photo)}" aria-label="Take this photo out">×</button>` : ''}</li>`).join('')}</ol>`
      : '<p class="gm-hint">No photos entered yet.</p>';
    return `${vote}${enter}<section class="gm-section"><h3>Standings</h3><p class="gm-hint">${plural(r.entries, 'photo', 'photos')} · your votes: ${r.myVotes}</p>${standings}</section>`;
  }

  function bingoView(r, host) {
    const live = r.status === 'live';
    const grid = `<div class="gm-bingo" style="--n:${r.size}">${r.tiles.map((t) => `
      <button class="gm-tile ${t.mine ? 'is-mine' : ''}" type="button" data-tile="${t.index}" ${live || host ? '' : 'disabled'}>
        ${t.mine ? `<img src="${esc(t.mine.thumbnailUrl || t.mine.url)}" alt="">` : ''}<span>${esc(t.prompt)}</span>${t.claims ? `<small>${t.claims}</small>` : ''}</button>`).join('')}</div>`;
    const leaders = r.leaders?.length ? `<ol class="gm-board">${r.leaders.map((x) => `<li class="${x.mine ? 'is-mine' : ''}"><span>${x.rank}</span><b>${esc(x.name)}</b><em>${x.points}</em></li>`).join('')}</ol>` : '';
    return `${live ? '<p class="gm-hint">Tap a square to fill it with one of your photos.</p>' : ''}
      <p class="gm-score">Squares <b>${r.myTiles}</b> · lines <b>${r.myLines}</b> · points <b>${r.myScore}</b></p>${r.fullCard ? '<p class="gm-q gm-bingo-call">BINGO! Full card 🎉</p>' : ''}
      ${grid}${leaders ? `<section class="gm-section"><h3>Top players</h3>${leaders}</section>` : ''}`;
  }

  function contestView(r, host) {
    const img = (e) => `<img src="${esc(e.thumbnailUrl || e.url)}" alt="">`;
    let html = '';
    if (r.phase === 'entries' && r.status === 'live') {
      html += `<p class="gm-hint">Upload your photo for this competition. Entries so far: ${r.entries}. Each person can enter: ${r.maxEntries}.</p>`;
      if (r.canEnter) html += '<label class="gm-main gm-file">Upload an entry<input type="file" accept="image/*" data-submit hidden></label>';
      if (r.myEntries.length) html += `<h3>Your entries</h3><div class="gm-thumbs">${r.myEntries.map((e) => `<div class="gm-thumb">${img(e)}<button class="gm-x" type="button" data-unsubmit="${esc(e.id)}" aria-label="Take this entry back">×</button></div>`).join('')}</div>`;
      if (host && r.all?.length) html += `<h3>All entries (only you see these)</h3><div class="gm-thumbs">${r.all.map((e) => `<div class="gm-thumb">${img(e)}<small>${esc(e.by)}</small></div>`).join('')}</div>`;
    }
    if (r.status === 'draft') html += '<p class="gm-empty">Waiting for the host to open entries.</p>';
    if (r.podium?.length) html += `<h3>Winning photos</h3><ol class="gm-standings">${r.podium.map((p) => `<li class="${p.mine ? 'is-mine' : ''}"><span>${MEDAL_ICON[p.place] || medal(p.place)}</span>${img(p)}<b>${esc(p.by)}</b></li>`).join('')}</ol>`;
    if (r.finalists?.length && r.status !== 'ended') {
      html += `<h3>Finalists</h3>${r.ai === false ? '' : '<p class="gm-hint">Picked with AI.</p>'}<ul class="gm-finalists">${r.finalists.map((f) => `<li class="${f.mine ? 'is-mine' : ''}">${img(f)}<div><b>${esc(f.by)}</b><span>${esc(f.reason || '')}</span></div></li>`).join('')}</ul>`;
      if (host && r.status === 'live') {
        const opt = (sel) => r.finalists.map((f, i) => `<option value="${esc(f.entry)}" ${r.podium?.[sel]?.entry === f.entry ? 'selected' : ''}>${i + 1}. ${esc(f.by)}</option>`).join('');
        html += `<form class="gm-podium" data-podium>${[0, 1, 2].map((n) => `<label>${MEDAL_ICON[n + 1]}<select name="p${n}" aria-label="${medal(n + 1)} place"><option value="">Choose…</option>${opt(n)}</select></label>`).join('')}
          <button class="gm-main" type="submit">Save winners</button><p class="gm-hint">Winners must be different people. Then press End game to announce them.</p></form>`;
      }
    } else if (r.phase === 'judging' && r.status === 'live') html += '<p class="gm-empty">Entries are closed. The host is picking the winners.</p>';
    if (r.top?.length) html += `<h3>Top 10</h3><div class="gm-thumbs">${r.top.map((e) => `<div class="gm-thumb ${e.mine ? 'is-mine' : ''}">${img(e)}<small>${e.rank}. ${esc(e.by)}</small></div>`).join('')}</div>`;
    return html || '<p class="gm-empty">Nothing to show yet.</p>';
  }

  // ---- Choosing one of your own photos (battle entries, bingo squares) ----
  function picker() {
    const mine = myPhotos();
    const used = new Set(G.pick?.used || []);
    return `${G.pick?.title ? `<p class="gm-q">${esc(G.pick.title)}</p>` : ''}<p class="gm-hint">${esc(G.pick?.prompt || 'Choose one of your photos from this event.')}</p>
      ${mine.length ? `<div class="gm-thumbs">${mine.map((p) => `<button class="gm-thumb gm-choose" type="button" data-choose="${esc(p.id)}" ${used.has(p.id) ? 'disabled' : ''}><img src="${esc(p.thumbnailUrl || p.url)}" alt=""></button>`).join('')}</div>`
        : '<p class="gm-empty">You haven’t added any photos to this event yet. Close Games, add photos, then come back.</p>'}
      ${G.pick?.remove ? '<button class="gm-ghost gm-danger" type="button" data-unclaim>Empty this square</button>' : ''}`;
  }
  function pickPhoto(prompt, onPick, extra = {}) {
    G.pick = { prompt, onPick, ...extra };
    G.view = 'pick'; G.html = ''; paint();
  }

  // ---- The host's New game form ----
  function newForm() {
    const t = G.newType;
    const chips = Object.entries(TYPES).map(([k, v]) => `<label class="gm-chip" style="--gc:${v.color}"><input type="radio" name="type" value="${k}" ${k === t ? 'checked' : ''}><span><i class="gm-ic" aria-hidden="true">${v.icon}</i><b>${v.name}</b><small>${v.blurb}</small></span></label>`).join('');
    let fields = '';
    if (t === 'poll') fields = `<label class="gm-field">Question<input name="question" maxlength="160" required placeholder="Which song should play next?"></label>
      <div class="gm-options" data-list="options">${[1, 2].map((n) => optionInput(n)).join('')}</div>
      <button class="gm-link" type="button" data-add="options">Add an option</button>`;
    else if (t === 'trivia') fields = `<div data-list="questions">${questionBlock(1)}</div><button class="gm-link" type="button" data-add="questions">Add a question</button>`;
    else if (t === 'battle') fields = '<label class="gm-field">Photos each guest can enter<input name="maxEntries" type="number" min="1" max="5" value="1"></label>';
    else if (t === 'contest') fields = '<label class="gm-field">Entries each guest can upload<input name="maxEntries" type="number" min="1" max="3" value="1"></label>';
    else if (t === 'bingo') fields = `<label class="gm-field">Card size<select name="size"><option value="3">3 × 3</option><option value="4">4 × 4</option></select></label>
      <label class="gm-field">Your own prompts (optional)<textarea name="prompts" rows="5" placeholder="One per line: 9 for 3 × 3, 16 for 4 × 4. Leave empty for a ready-made card."></textarea></label>`;
    else if (t === 'crop') fields = `<label class="gm-field">How many photos<input name="auto" type="number" min="1" max="10" value="5"></label>
      <label class="gm-field">Seconds per photo<input name="seconds" type="number" min="15" max="120" value="30"></label>
      <p class="gm-hint">Random photos from this event; guests guess whose photo it is.</p>`;
    // A time limit: the game ends by itself and the winners are announced
    const endsAt = (window.momentoAlbum?.() || G.album)?.endsAt;
    const time = TIMED.has(t) ? `<label class="gm-field">Time limit<select name="limit">
        <option value="">No limit (you end it)</option>
        ${LIMITS.map((m) => `<option value="${m}" ${m === 10 ? 'selected' : ''}>${limitText(m)}</option>`).join('')}
        ${endsAt && new Date(endsAt) > Date.now() ? '<option value="event">Until the event ends</option>' : ''}
      </select></label><p class="gm-hint">When time’s up the game ends by itself, the winners get a notification and everyone sees the results.</p>`
      : t === 'contest' ? '<p class="gm-hint">You pick the winners. When you end the competition they get a notification and everyone sees the results.</p>'
      : '<p class="gm-hint">When the last one is done, the top scorers win and get a notification.</p>';
    return `<form class="gm-form" data-gm-create>
      <fieldset class="gm-types"><legend>Game</legend>${chips}</fieldset>
      <label class="gm-field">Title<input name="title" maxlength="60" placeholder="${esc(TYPES[t].name)}"></label>
      ${fields}
      ${time}
      <label class="gm-check"><input type="checkbox" name="start" checked> Start it now</label>
      <button class="gm-main" type="submit">Create game</button></form>`;
  }
  const optionInput = (n, name = 'option') => `<input class="gm-input" name="${name}" maxlength="60" placeholder="Option ${n}" ${n <= 2 ? 'required' : ''}>`;
  function questionBlock(n) {
    return `<fieldset class="gm-qblock"><legend>Question ${n}</legend>
      <input class="gm-input" name="qtext" maxlength="160" required placeholder="Question">
      ${[0, 1, 2, 3].map((i) => `<label class="gm-ans"><input type="radio" name="right${n}" value="${i}" ${i === 0 ? 'checked' : ''} aria-label="Right answer"><input class="gm-input" name="qopt" maxlength="60" placeholder="Answer ${i + 1}${i < 2 ? '' : ' (optional)'}" ${i < 2 ? 'required' : ''}></label>`).join('')}
      <label class="gm-field gm-inline">Seconds<input name="qsec" type="number" min="5" max="120" value="20"></label>
      <p class="gm-hint">Tick the right answer.</p></fieldset>`;
  }
  function wireForm() {
    const form = body.querySelector('[data-gm-create]');
    form.addEventListener('change', (e) => { if (e.target.name === 'type') { G.newType = e.target.value; G.html = ''; paint(); } });
  }
  function readForm(form) {
    const f = new FormData(form);
    const out = { type: G.newType, title: (f.get('title') || '').trim() || TYPES[G.newType].name, start: f.get('start') === 'on' };
    if (out.type === 'poll') { out.question = f.get('question').trim(); out.options = f.getAll('option').map((s) => s.trim()).filter(Boolean); }
    if (out.type === 'trivia') {
      out.questions = [...form.querySelectorAll('.gm-qblock')].map((b, n) => {
        const opts = [...b.querySelectorAll('[name=qopt]')].map((i) => i.value.trim());
        const right = +(b.querySelector(`[name=right${n + 1}]:checked`)?.value || 0);
        const kept = opts.map((o, i) => ({ o, i })).filter((x) => x.o);
        return { text: b.querySelector('[name=qtext]').value.trim(), options: kept.map((x) => x.o), answer: Math.max(0, kept.findIndex((x) => x.i === right)), seconds: +b.querySelector('[name=qsec]').value || 20 };
      });
      const bad = out.questions.findIndex((q, n) => !form.querySelectorAll('.gm-qblock')[n].querySelectorAll('[name=qopt]')[form.querySelector(`[name=right${n + 1}]:checked`)?.value || 0].value.trim());
      if (bad >= 0) throw new Error(`Question ${bad + 1}: the ticked right answer is empty.`);
    }
    if (out.type === 'battle' || out.type === 'contest') out.maxEntries = +f.get('maxEntries') || 1;
    if (out.type === 'bingo') {
      out.size = +f.get('size') || 3;
      const prompts = (f.get('prompts') || '').split('\n').map((s) => s.trim()).filter(Boolean);
      if (prompts.length) {
        if (prompts.length !== out.size * out.size) throw new Error(`A ${out.size} × ${out.size} card needs exactly ${out.size * out.size} prompts (you wrote ${prompts.length}), or leave it empty.`);
        out.prompts = prompts;
      }
    }
    if (out.type === 'crop') { out.auto = +f.get('auto') || 5; out.seconds = +f.get('seconds') || 30; }
    if (TIMED.has(out.type)) {
      const limit = f.get('limit');
      if (limit === 'event') out.untilEventEnds = true;
      else if (limit) out.minutes = +limit;
    }
    return out;
  }

  // ---- Every tap and form in the window ----
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-open]');
    if (!t || t.disabled) return;
    const r = roundOf(G.round);
    const d = t.dataset;
    if (d.new !== undefined) { G.view = 'new'; G.html = ''; paint(); return; }
    if (d.board) { G.board = d.board; G.html = ''; paint(); return; }
    if (d.replay) { const rr = roundOf(d.replay); if (rr) cheer(rr, { again: true }); return; }
    if (d.open) { G.round = d.open; G.view = 'round'; G.pair = null; G.pairFor = null; G.pairNote = ''; G.html = ''; paint(); return; }
    if (d.add === 'options') {
      const list = body.querySelector('[data-list=options]');
      const n = list.querySelectorAll('input').length;
      if (n < 6) list.insertAdjacentHTML('beforeend', optionInput(n + 1));
      if (n + 1 >= 6) t.hidden = true;
      return;
    }
    if (d.add === 'questions') {
      const list = body.querySelector('[data-list=questions]');
      const n = list.querySelectorAll('.gm-qblock').length;
      if (n < 20) list.insertAdjacentHTML('beforeend', questionBlock(n + 1));
      if (n + 1 >= 20) t.hidden = true;
      return;
    }
    if (d.host && r) {
      if (d.host === 'delete') {
        ask({ from: t, title: `Delete “${r.title}”?`, body: 'Its points come off the leaderboard.', ok: 'Delete game' }).then((ok) => {
          if (ok) act(() => api(`/${r.id}`, { method: 'DELETE' }), () => { G.view = 'list'; G.round = null; });
        });
        return;
      }
      if (d.host === 'end') {
        ask({ from: t, title: r.type === 'contest' ? 'End the competition?' : 'End this game for everyone?',
          body: r.type === 'contest' ? 'Only the top 10 entries are kept; every other entry is deleted. The winners get a notification.'
            : r.type === 'poll' ? 'Nobody can vote after this.' : 'Nobody can play it after this. The top scorers win and get a notification.', ok: 'End game' })
          .then((ok) => { if (ok) act(() => api(`/${r.id}/end`, json('POST', {}))); });
        return;
      }
      act(() => api(`/${r.id}/${d.host}`, json('POST', {})));
      return;
    }
    // Your own vote or answer shows at once (the shared copy on the server can be up to 2 seconds old)
    const mark = (patch) => () => { const now = roundOf(r.id); if (now) Object.assign(now, patch(now)); };
    if (d.vote && r) { act(() => api(`/${r.id}/vote`, json('POST', { option: +d.vote })), mark(() => ({ myChoice: +d.vote }))); return; }
    if (d.answer && r) {
      act(() => api(`/${r.id}/${r.type === 'crop' ? 'guess' : 'answer'}`, json('POST', { question: +d.q, option: +d.answer })),
        mark((now) => (now.myAnswer ? {} : { myAnswer: { option: +d.answer } })));
      return;
    }
    if (d.pair !== undefined && r) { loadPair(r); return; }
    if (d.pick && r) {
      // One vote per pair: both photos lock at once (the chosen one marked) until the next pair arrives
      if (G.picked) return;
      G.picked = d.pick;
      body.querySelectorAll('[data-pick]').forEach((b) => { b.disabled = true; b.classList.toggle('is-picked', b === t); });
      act(() => api(`/${r.id}/pick`, json('POST', { winner: d.pick, loser: d.lose })), () => loadPair(r, true))
        .finally(() => { G.picked = null; G.html = ''; paint(); });
      return;
    }
    if (d.enter !== undefined && r) {
      pickPhoto('Choose one of your photos from this event to enter.', (photo) => act(() => api(`/${r.id}/entries`, json('POST', { photo })), () => { G.view = 'round'; }),
        { used: r.myEntries });
      return;
    }
    if (d.withdraw && r) { act(() => api(`/${r.id}/entries/${encodeURIComponent(d.withdraw)}`, { method: 'DELETE' })); return; }
    if (d.tile !== undefined && r) { tileTap(r, +d.tile); return; }
    if (d.choose && G.pick) { const fn = G.pick.onPick; G.pick = null; fn(d.choose); return; }
    if (d.unclaim !== undefined && G.pick) { const fn = G.pick.remove; G.pick = null; fn(); return; }
    if (d.unsubmit && r) {
      ask({ from: t, title: 'Take this entry back?', body: 'It will be deleted.', ok: 'Take it back' }).then((ok) => {
        if (ok) act(() => api(`/${r.id}/submissions/${encodeURIComponent(d.unsubmit)}`, { method: 'DELETE' }));
      });
    }
  });
  body.addEventListener('change', (e) => {
    const input = e.target.closest('[data-submit]');
    const r = roundOf(G.round);
    if (!input || !r || !input.files[0]) return;
    const fd = new FormData();
    fd.append('photo', input.files[0]);
    act(() => api(`/${r.id}/submissions`, { method: 'POST', body: fd }), () => toast('Entry uploaded', 'Good luck!'));
  });
  body.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    if (form.matches('[data-gm-create]')) {
      let b;
      try { b = readForm(form); } catch (err) { toast('Games', err.message); return; }
      act(() => api('', json('POST', b)), (res) => { G.round = res.game.id; G.view = 'round'; });
      return;
    }
    if (form.matches('[data-podium]')) {
      const r = roundOf(G.round);
      const f = new FormData(form);
      const [first, second, third] = ['p0', 'p1', 'p2'].map((k) => f.get(k) || undefined);
      if (!first) { toast('Games', 'Choose at least the winner.'); return; }
      act(() => api(`/${r.id}/podium`, json('POST', { first, second, third })), () => toast('Winners saved', 'Press End game to announce them.'));
    }
  });

  async function loadPair(r, quiet) {
    try {
      const res = await api(`/${r.id}/pair`);
      G.pairFor = r.id;
      G.pair = res.pair;
      G.pairNote = res.pair ? '' : res.reason === 'all-voted' ? 'You’ve voted on every pair. Check back when more photos are in.' : 'Not enough photos from other people yet.';
    } catch (err) { if (!quiet) toast('Games', err.message); }
    G.html = ''; paint();
  }
  function tileTap(r, index) {
    const tile = r.tiles[index];
    const host = G.data.host;
    if (r.status !== 'live') {
      if (host && r.claims) showClaims(r, index);
      return;
    }
    const used = r.tiles.filter((t) => t.mine).map((t) => t.mine.photo);
    pickPhoto('Choose one of your photos that fits this square.',
      (photo) => act(() => api(`/${r.id}/claims`, json('POST', { tile: index, photo })), () => { G.view = 'round'; }),
      { title: tile.prompt, used, remove: tile.mine ? () => act(() => api(`/${r.id}/claims/${index}`, { method: 'DELETE' }), () => { G.view = 'round'; }) : null });
    if (host && r.claims?.some((c) => c.tile === index)) body.insertAdjacentHTML('beforeend', claimsHtml(r, index));
  }
  // The host: everyone's photo for a square, each with Remove
  function claimsHtml(r, index) {
    const list = r.claims.filter((c) => c.tile === index);
    return `<section class="gm-section gm-claims"><h3>Everyone’s photos for this square</h3><div class="gm-thumbs">${list.map((c) => `<div class="gm-thumb"><img src="${esc(c.thumbnailUrl || c.url)}" alt=""><small>${esc(c.name)}</small><button class="gm-x" type="button" data-remove-claim="${esc(c.user)}" data-tile-index="${index}" aria-label="Remove ${esc(c.name)}’s photo">×</button></div>`).join('')}</div></section>`;
  }
  function showClaims(r, index) {
    body.querySelector('.gm-claims')?.remove();
    body.insertAdjacentHTML('beforeend', claimsHtml(r, index));
  }
  body.addEventListener('click', (e) => {
    const t = e.target.closest('[data-remove-claim]');
    const r = roundOf(G.round);
    if (!t || !r) return;
    act(() => api(`/${r.id}/claims/${t.dataset.tileIndex}?user=${encodeURIComponent(t.dataset.removeClaim)}`, { method: 'DELETE' }), () => { G.view = 'round'; });
  });

  // ---- The celebration: confetti and the winners, when a game finishes ----
  function findCheers(d) {
    for (const r of d.rounds) {
      if (r.status !== 'ended' || cheered.has(r.id) || !r.endedAt) continue;
      if (Date.now() - new Date(r.endedAt).getTime() > CHEER_MS) { markCheered(r.id); continue; }
      const worth = r.type === 'poll' ? r.total > 0 : r.results?.length;
      markCheered(r.id);
      if (worth) G.queue.push(r.id);
    }
    if (!G.cheering && G.queue.length) {
      const r = roundOf(G.queue.shift());
      if (r) cheer(r);
    }
  }
  function cheer(r, { again = false } = {}) {
    G.cheering = true;
    const t = typeOf(r);
    let heading, sub, stand = '';
    if (r.type === 'poll') {
      const best = Math.max(...r.options.map((o) => o.votes));
      const top = r.options.filter((o) => o.votes === best).map((o) => `“${o.text}”`);
      heading = 'The votes are in!';
      sub = `${names(top)} ${top.length > 1 ? 'tied' : 'won'} with ${r.options.find((o) => o.votes === best).percent}% of ${plural(r.total, 'vote', 'votes')}.`;
    } else {
      const first = r.results.filter((p) => p.place === 1);
      const me = r.results.find((p) => p.mine);
      heading = r.iWon ? (first.length > 1 ? 'You tied for 1st!' : 'You won!') : `${names(first.map((p) => p.name))} ${first.length > 1 ? 'win' : 'wins'}!`;
      sub = r.iWon ? `${first[0].points} points. Your win is on the event’s leaderboard.` : me ? `You came ${medal(me.place)} with ${me.points} points.` : `With ${first[0].points} points.`;
      stand = `<ol class="gm-podium-board is-party">${[2, 1, 3].map((p, i) => {
        const list = r.results.filter((x) => x.place === p);
        return list.length ? `<li class="gm-step is-p${p} ${list.some((x) => x.mine) ? 'is-mine' : ''}" style="--h:${[70, 100, 52][i]}%;--d:${[1, 2, 0][i] * 160}ms">
          <span class="gm-step-medal" aria-hidden="true">${MEDAL_ICON[p]}</span><b>${esc(names(list.map((x) => x.name)))}</b><em>${list[0].points} pts</em><i aria-hidden="true">${p}</i></li>` : '<li class="gm-step is-empty" aria-hidden="true"></li>';
      }).join('')}</ol>`;
    }
    const d = document.createElement('dialog');
    d.className = 'gm-party';
    d.setAttribute('aria-labelledby', 'gmPartyTitle');
    d.innerHTML = `<canvas class="gm-party-fx" aria-hidden="true"></canvas>
      <div class="gm-party-card${r.iWon ? ' is-me' : ''}" style="--gc:${t.color}">
        <div class="gm-trophy" aria-hidden="true">${r.type === 'poll' ? '🗳️' : r.iWon ? '🏆' : '🎉'}</div>
        <p class="gm-party-game"><span aria-hidden="true">${t.icon}</span> ${esc(r.title || t.name)} · ${again ? 'Results' : 'Time’s up'}</p>
        <h2 id="gmPartyTitle">${esc(heading)}</h2>
        <p class="gm-party-sub">${esc(sub)}</p>
        ${stand}
        <div class="gm-party-acts"><button class="gm-main" type="button" data-party-close>${r.iWon ? 'Woohoo!' : 'Nice!'}</button>
          ${modal.open && G.view === 'list' ? '' : '<button class="gm-ghost" type="button" data-party-board>See leaderboard</button>'}</div>
      </div>`;
    document.body.append(d);
    let stop = () => {};
    const done = () => {
      stop(); d.close(); d.remove(); G.cheering = false;
      const next = G.queue.length && roundOf(G.queue.shift());
      if (next) setTimeout(() => cheer(next), 400);
    };
    d.addEventListener('cancel', (e) => { e.preventDefault(); done(); });
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-party-close]') || e.target === d) done();
      else if (e.target.closest('[data-party-board]')) { done(); G.board = 'wins'; openWindow(); }
    });
    d.showModal();
    d.querySelector('[data-party-close]').focus();
    if (!reducedMotion()) stop = confetti(d.querySelector('canvas'), r.iWon);
    try { if (r.iWon && !reducedMotion()) navigator.vibrate?.([60, 40, 120]); } catch {}
  }
  // Paper confetti from the middle, then from both bottom corners (more for your own win). Returns a stop function.
  function confetti(canvas, big) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => { canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr; };
    size(); addEventListener('resize', size);
    const parts = [];
    const burst = (x, y, n, { spread, up, min }) => {
      for (let i = 0; i < n; i++) parts.push({
        x: x * dpr, y: y * dpr, vx: (Math.random() - .5) * spread * dpr, vy: -(min + Math.random() * up) * dpr,
        w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 9) * dpr, r: Math.random() * 6.28, vr: (Math.random() - .5) * .35,
        c: CONFETTI[Math.floor(Math.random() * CONFETTI.length)], round: Math.random() < .25, wob: Math.random() * 6.28,
      });
    };
    burst(innerWidth / 2, innerHeight * .42, big ? 200 : 130, { spread: 26, up: 14, min: 3 });
    const corners = setTimeout(() => {
      burst(innerWidth * .04, innerHeight, big ? 110 : 60, { spread: 12, up: 16, min: 12 });
      burst(innerWidth * .96, innerHeight, big ? 110 : 60, { spread: 12, up: 16, min: 12 });
      for (const p of parts.slice(-(big ? 220 : 120))) p.vx = Math.abs(p.vx) * (p.x < canvas.width / 2 ? 1 : -1) + (p.x < canvas.width / 2 ? 3 : -3) * dpr;
    }, 380);
    const t0 = performance.now();
    let raf = 0;
    const frame = (now) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vx *= .985; p.vy = p.vy * .985 + .34 * dpr; p.wob += .12;
        p.x += p.vx + Math.sin(p.wob) * .6 * dpr; p.y += p.vy; p.r += p.vr;
        if (p.y > canvas.height + 40 * dpr) { parts.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.round) { ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, 6.28); ctx.fill(); }
        else ctx.fillRect(-p.w / 2, -p.h / 2 * Math.abs(Math.cos(p.wob)), p.w, p.h * Math.abs(Math.cos(p.wob)) + 1);
        ctx.restore();
      }
      if (parts.length && now - t0 < 9000) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); clearTimeout(corners); removeEventListener('resize', size); };
  }
}
