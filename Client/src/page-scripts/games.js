/* Event games on the album page: the Games button in an event album's header opens a window with the event's games
   (polls, quizzes, photo battles, scavenger bingo, mystery crop and photo competitions), the leaderboard, and, for
   the host, a form to make a game and the buttons to run it. Talks to /api/albums/:id/games (API_CONTRACT.md) and
   asks again every pollEveryMs (3 s) while the window is open. albums.js tells it which album is open
   (the momento:album event) and lends it the album's photos (window.momentoAlbum). */
/* eslint-disable */

const TYPES = {
  poll: { name: 'Poll', blurb: 'Everyone votes on one question.' },
  trivia: { name: 'Quiz', blurb: 'Timed questions; quick right answers score more.' },
  battle: { name: 'Photo battle', blurb: 'Guests enter photos and vote between two at a time.' },
  bingo: { name: 'Scavenger bingo', blurb: 'Fill a card of prompts with your own photos.' },
  crop: { name: 'Mystery crop', blurb: 'Guess the event photo from a close-up.' },
  contest: { name: 'Photo competition', blurb: 'Guests upload entries; you pick the winners.' },
};
const STATUS = { draft: 'Not started', live: 'Live', ended: 'Finished' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isEvent = (a) => !!a && (a.kind ? a.kind === 'event' : !!a.startsAt);
const toast = (title, msg) => (window.Momento?.toast ? window.Momento.toast(title, msg) : console.warn(title, msg));
const medal = (n) => ['1st', '2nd', '3rd'][n - 1] || `${n}th`;

export default function installGames() {
  const btn = document.getElementById('abGames');
  const modal = document.getElementById('gamesModal');
  const body = document.getElementById('gmBody');
  const title = document.getElementById('gmTitle');
  const back = document.getElementById('gmBack');
  if (!btn || !modal || !body) return;

  // view: list | round | new | pick
  const G = { album: null, data: null, view: 'list', round: null, newType: 'poll', pair: null, pairFor: null, pairNote: '', pick: null, timer: 0, ticker: 0, html: '', busy: false };
  const api = (path, opts) => window.momentoApi(`/api/albums/${encodeURIComponent(G.album.id)}/games${path}`, opts);
  const json = (method, b) => window.momentoJson(method, b);
  const roundOf = (id) => G.data?.rounds.find((r) => r.id === id) || null;
  const myPhotos = () => ((window.momentoAlbum?.() || G.album)?.photoItems || []).filter((p) => p.mine);

  // ---- The Games button: only in events; a dot while a game is live ----
  document.addEventListener('momento:album', async (e) => {
    const a = e.detail;
    G.album = a; G.data = null;
    btn.hidden = !isEvent(a);
    btn.classList.remove('is-live');
    if (btn.hidden) return;
    try {
      const d = await api('');
      if (G.album !== a) return;
      if (!d.enabled) { btn.hidden = true; return; }
      G.data = d;
      btn.classList.toggle('is-live', d.rounds.some((r) => r.status === 'live'));
    } catch {}
  });
  btn.addEventListener('click', () => {
    if (!G.album) return;
    G.view = 'list'; G.round = null; G.html = '';
    if (G.data) paint();
    else body.innerHTML = '<p class="gm-empty">Loading games…</p>';
    modal.showModal();
    refresh();
  });
  const close = () => { clearTimeout(G.timer); clearInterval(G.ticker); modal.close(); };
  modal.querySelector('[data-gm-close]').addEventListener('click', close);
  modal.addEventListener('close', () => { clearTimeout(G.timer); clearInterval(G.ticker); });
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
        if (!d.enabled) { close(); btn.hidden = true; return; }
        G.data = d;
        btn.classList.toggle('is-live', d.rounds.some((r) => r.status === 'live'));
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
      G.data = await api('');
      if (after) await after(r);
      G.html = '';
      paint();
      // The server shares one copy of the games for up to 2 seconds, so look again just after it renews
      clearTimeout(G.timer);
      G.timer = setTimeout(refresh, 2100);
    } catch (err) { toast('Games', err.message); }
    finally { G.busy = false; body.classList.remove('is-busy'); }
  }

  // ---- Painting: the html is only swapped when it changed, so a poll doesn't disturb taps or the crop picture ----
  function paint() {
    const r = G.view === 'round' || G.view === 'pick' ? roundOf(G.round) : null;
    if ((G.view === 'round' || G.view === 'pick') && !r) { G.view = 'list'; G.round = null; }
    back.hidden = G.view === 'list';
    title.textContent = G.view === 'new' ? 'New game' : r ? r.title || TYPES[r.type]?.name : 'Games';
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
  // Countdowns: seconds left on the question on screen (and a fresh look when it runs out)
  function tick() {
    for (const el of body.querySelectorAll('[data-ends]')) {
      const left = Math.max(0, Math.ceil((new Date(el.dataset.ends).getTime() - Date.now()) / 1000));
      el.textContent = left ? `${left}s` : 'Time’s up';
      if (!left && !el.dataset.done) { el.dataset.done = '1'; setTimeout(() => { G.html = ''; refresh(); }, 600); }
    }
  }

  // ---- The list: every game, the leaderboard, and the host's New game button ----
  function listView() {
    const d = G.data;
    if (!d) return '<p class="gm-empty">Loading games…</p>';
    const rounds = [...d.rounds].sort((a, b) => ({ live: 0, draft: 1, ended: 2 }[a.status] - { live: 0, draft: 1, ended: 2 }[b.status]));
    const shown = d.host ? rounds : rounds.filter((r) => r.status !== 'draft');
    const list = shown.length ? `<ul class="gm-list">${shown.map((r) => `
      <li><button class="gm-row" type="button" data-open="${esc(r.id)}">
        <span class="gm-type">${esc(TYPES[r.type]?.name || r.type)}</span>
        <b>${esc(r.title || TYPES[r.type]?.name)}</b>
        <span class="gm-status is-${r.status}">${STATUS[r.status]}</span>
      </button></li>`).join('')}</ul>`
      : `<p class="gm-empty">${d.host ? 'No games yet. Make one for your guests to play.' : 'No games yet. The host will start one soon.'}</p>`;
    const board = d.leaderboard.length ? `<ol class="gm-board">${d.leaderboard.map((x) => `<li class="${x.mine ? 'is-mine' : ''}"><span>${x.rank}</span><b>${esc(x.mine ? 'You' : x.name)}</b><em>${x.points}</em></li>`).join('')}</ol>`
      : '<p class="gm-hint">Points from every game appear here.</p>';
    return `${d.host ? '<button class="gm-main" type="button" data-new>New game</button>' : ''}
      ${list}
      <section class="gm-section"><h3>Leaderboard <small>Your points: ${d.myPoints}</small></h3>${board}</section>`;
  }

  // ---- One game ----
  function roundView(r) {
    const host = G.data.host;
    const status = `<p class="gm-sub"><span class="gm-type">${esc(TYPES[r.type]?.name)}</span> <span class="gm-status is-${r.status}">${STATUS[r.status]}</span></p>`;
    let main = '';
    if (r.type === 'poll') main = pollView(r);
    else if (r.type === 'trivia' || r.type === 'crop') main = quizView(r, host);
    else if (r.type === 'battle') main = battleView(r);
    else if (r.type === 'bingo') main = bingoView(r, host);
    else if (r.type === 'contest') main = contestView(r, host);
    return status + main + (host ? hostBar(r) : '');
  }
  function hostBar(r) {
    const b = [];
    if (r.status === 'draft') b.push('<button class="gm-main" type="button" data-host="start">Start game</button>');
    if (r.status === 'live') {
      if ((r.type === 'trivia' || r.type === 'crop')) b.push(`<button class="gm-main" type="button" data-host="next">${r.current != null && r.current + 1 >= r.questionCount ? 'Finish' : 'Next question'}</button>`);
      if (r.type === 'contest' && r.phase === 'entries') b.push('<button class="gm-main" type="button" data-host="shortlist">Close entries and pick finalists</button>');
      b.push('<button class="gm-ghost" type="button" data-host="end">End game</button>');
    }
    b.push('<button class="gm-ghost gm-danger" type="button" data-host="delete">Delete game</button>');
    return `<div class="gm-hostbar"><span>Host</span>${b.join('')}</div>`;
  }

  function pollView(r) {
    const live = r.status === 'live';
    return `<p class="gm-q">${esc(r.question)}</p>
      <div class="gm-opts">${r.options.map((o) => `
        <button class="gm-opt gm-bar ${r.myChoice === o.id ? 'is-mine' : ''}" type="button" data-vote="${esc(o.id)}" ${live ? '' : 'disabled'} style="--p:${o.percent}%">
          <span>${esc(o.text)}</span><em>${r.myChoice != null || !live ? `${o.percent}%` : ''}</em></button>`).join('')}</div>
      <p class="gm-hint">${r.total} ${r.total === 1 ? 'vote' : 'votes'}${live ? (r.myChoice != null ? ' · you can change your vote' : ' · tap to vote') : ''}</p>`;
  }

  function quizView(r, host) {
    const crop = r.type === 'crop';
    if (r.status === 'draft') return `<p class="gm-empty">${r.questionCount} ${crop ? (r.questionCount === 1 ? 'photo' : 'photos') : (r.questionCount === 1 ? 'question' : 'questions')}. Waiting for the host to start.</p>${host && r.questions ? hostQuestions(r) : ''}`;
    if (r.status === 'ended' || !r.question) return `<p class="gm-empty">${r.status === 'ended' ? 'Finished.' : 'Waiting for the next question…'} Your score in this game: <b>${r.myScore}</b></p>`;
    const q = r.question, mine = r.myAnswer, revealed = q.answer !== undefined;
    const pic = crop ? `<figure class="gm-crop"><img class="gm-crop-img" src="${esc(revealed && q.thumbnailUrl ? q.url : q.image)}" alt="${revealed ? 'The whole photo' : 'A close-up of an event photo'}">
      ${!revealed ? `<figcaption>Zoom ${q.stage + 1} of ${q.stages} · ${q.points} points now</figcaption>` : ''}</figure>` : '';
    return `<p class="gm-sub">${crop ? 'Photo' : 'Question'} ${q.index + 1} of ${r.questionCount} · <span class="gm-clock" ${revealed ? '' : `data-ends="${esc(q.endsAt)}"`}>${revealed ? 'Time’s up' : ''}</span></p>
      ${pic}<p class="gm-q">${esc(q.text)}</p>
      <div class="gm-opts">${q.options.map((o, i) => {
        const cls = [mine?.option === i && 'is-mine', revealed && i === q.answer && 'is-right', revealed && mine?.option === i && i !== q.answer && 'is-wrong'].filter(Boolean).join(' ');
        return `<button class="gm-opt ${cls}" type="button" data-answer="${i}" data-q="${q.index}" ${mine || revealed ? 'disabled' : ''}>${esc(o)}</button>`;
      }).join('')}</div>
      <p class="gm-hint">${mine ? (revealed ? (mine.correct ? `Right! +${mine.points} points` : 'Not this time.') : 'Answer locked in.') : (revealed ? 'You didn’t answer this one.' : 'Pick an answer.')}
        · ${q.answers} answered · your score ${r.myScore}</p>`;
  }
  function hostQuestions(r) {
    return `<details class="gm-details"><summary>Questions and answers (only you see these)</summary><ol>${r.questions.map((q) => `<li>${esc(q.text)} <b>${esc(q.options?.[q.answer] ?? '')}</b></li>`).join('')}</ol></details>`;
  }

  function battleView(r) {
    const live = r.status === 'live';
    const mine = r.standings.filter((e) => e.mine);
    let vote = '';
    if (live && r.canVote) {
      if (G.pair && G.pairFor === r.id) vote = `<h3>Which is better?</h3><div class="gm-pair">${G.pair.map((p, i) => `
        <button class="gm-pick" type="button" data-pick="${esc(p.photo)}" data-lose="${esc(G.pair[1 - i].photo)}"><img src="${esc(p.thumbnailUrl || p.url)}" alt="Photo ${i + 1}"></button>`).join('')}</div>`;
      else vote = `<p class="gm-hint">${esc(G.pairFor === r.id && G.pairNote || '')}</p><button class="gm-main" type="button" data-pair>Vote on photos</button>`;
    } else if (live) vote = '<p class="gm-hint">Voting opens when at least two photos from other people are in.</p>';
    const enter = live && r.canEnter ? `<button class="gm-ghost" type="button" data-enter>Enter one of your photos (${mine.length}/${r.maxEntries})</button>` : '';
    const standings = r.standings.length ? `<ol class="gm-standings">${r.standings.map((e) => `<li class="${e.mine ? 'is-mine' : ''}">
        <span>${e.place ? medal(e.place) : e.rank}</span><img src="${esc(e.thumbnailUrl || e.url)}" alt=""><b>${esc(e.by)}</b><em>${e.wins}–${e.losses}</em>
        ${e.mine && live ? `<button class="gm-x" type="button" data-withdraw="${esc(e.photo)}" aria-label="Take this photo out">×</button>` : ''}</li>`).join('')}</ol>`
      : '<p class="gm-hint">No photos entered yet.</p>';
    return `${vote}${enter}<section class="gm-section"><h3>Standings <small>${r.entries} ${r.entries === 1 ? 'photo' : 'photos'} · you voted ${r.myVotes} ${r.myVotes === 1 ? 'time' : 'times'}</small></h3>${standings}</section>`;
  }

  function bingoView(r, host) {
    const live = r.status === 'live';
    const grid = `<div class="gm-bingo" style="--n:${r.size}">${r.tiles.map((t) => `
      <button class="gm-tile ${t.mine ? 'is-mine' : ''}" type="button" data-tile="${t.index}" ${live || host ? '' : 'disabled'}>
        ${t.mine ? `<img src="${esc(t.mine.thumbnailUrl || t.mine.url)}" alt="">` : ''}<span>${esc(t.prompt)}</span>${t.claims ? `<small>${t.claims}</small>` : ''}</button>`).join('')}</div>`;
    const leaders = r.leaders?.length ? `<ol class="gm-board">${r.leaders.map((x) => `<li class="${x.mine ? 'is-mine' : ''}"><span>${x.rank}</span><b>${esc(x.name)}</b><em>${x.points}</em></li>`).join('')}</ol>` : '';
    return `<p class="gm-hint">${live ? 'Tap a square to fill it with one of your photos.' : ''} ${r.myTiles} ${r.myTiles === 1 ? 'square' : 'squares'} · ${r.myLines} ${r.myLines === 1 ? 'line' : 'lines'}${r.fullCard ? ' · full card!' : ''} · ${r.myScore} points</p>
      ${grid}${leaders ? `<section class="gm-section"><h3>Top players</h3>${leaders}</section>` : ''}`;
  }

  function contestView(r, host) {
    const img = (e) => `<img src="${esc(e.thumbnailUrl || e.url)}" alt="">`;
    let html = '';
    if (r.phase === 'entries' && r.status === 'live') {
      html += `<p class="gm-hint">Upload a photo for “${esc(r.title)}”. ${r.entries} ${r.entries === 1 ? 'entry' : 'entries'} so far. You can enter ${r.maxEntries}.</p>`;
      if (r.canEnter) html += '<label class="gm-main gm-file">Upload an entry<input type="file" accept="image/*" data-submit hidden></label>';
      if (r.myEntries.length) html += `<h3>Your entries</h3><div class="gm-thumbs">${r.myEntries.map((e) => `<div class="gm-thumb">${img(e)}<button class="gm-x" type="button" data-unsubmit="${esc(e.id)}" aria-label="Take this entry back">×</button></div>`).join('')}</div>`;
      if (host && r.all?.length) html += `<h3>All entries (only you see these)</h3><div class="gm-thumbs">${r.all.map((e) => `<div class="gm-thumb">${img(e)}<small>${esc(e.by)}</small></div>`).join('')}</div>`;
    }
    if (r.status === 'draft') html += '<p class="gm-empty">Waiting for the host to open entries.</p>';
    if (r.podium?.length) html += `<h3>Winners</h3><ol class="gm-standings">${r.podium.map((p) => `<li class="${p.mine ? 'is-mine' : ''}"><span>${medal(p.place)}</span>${img(p)}<b>${esc(p.by)}</b></li>`).join('')}</ol>`;
    if (r.finalists?.length && r.status !== 'ended') {
      html += `<h3>Finalists${r.ai === false ? '' : ' <small>picked with AI</small>'}</h3><ul class="gm-finalists">${r.finalists.map((f) => `<li class="${f.mine ? 'is-mine' : ''}">${img(f)}<div><b>${esc(f.by)}</b><span>${esc(f.reason || '')}</span></div></li>`).join('')}</ul>`;
      if (host && r.status === 'live') {
        const opt = (sel) => r.finalists.map((f, i) => `<option value="${esc(f.entry)}" ${r.podium?.[sel]?.entry === f.entry ? 'selected' : ''}>Finalist ${i + 1} (${esc(f.by)})</option>`).join('');
        html += `<form class="gm-podium" data-podium>${[0, 1, 2].map((n) => `<label>${medal(n + 1)}<select name="p${n}"><option value="">Choose…</option>${opt(n)}</select></label>`).join('')}
          <button class="gm-main" type="submit">Save winners</button><p class="gm-hint">Winners must be different people. Then press End game.</p></form>`;
      }
    } else if (r.phase === 'judging' && r.status === 'live') html += '<p class="gm-empty">Entries are closed. The host is picking the winners.</p>';
    if (r.top?.length) html += `<h3>Top 10</h3><div class="gm-thumbs">${r.top.map((e) => `<div class="gm-thumb ${e.mine ? 'is-mine' : ''}">${img(e)}<small>${e.rank}. ${esc(e.by)}</small></div>`).join('')}</div>`;
    return html || '<p class="gm-empty">Nothing to show yet.</p>';
  }

  // ---- Choosing one of your own photos (battle entries, bingo squares) ----
  function picker() {
    const mine = myPhotos();
    const used = new Set(G.pick?.used || []);
    return `<p class="gm-hint">${esc(G.pick?.prompt || 'Choose one of your photos from this event.')}</p>
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
    const chips = Object.entries(TYPES).map(([k, v]) => `<label class="gm-chip"><input type="radio" name="type" value="${k}" ${k === t ? 'checked' : ''}><span><b>${v.name}</b><small>${v.blurb}</small></span></label>`).join('');
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
    return `<form class="gm-form" data-gm-create>
      <fieldset class="gm-types"><legend>Game</legend>${chips}</fieldset>
      <label class="gm-field">Title<input name="title" maxlength="60" placeholder="${esc(TYPES[t].name)}"></label>
      ${fields}
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
    return out;
  }

  // ---- Every tap and form in the window ----
  body.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-open]');
    if (!t || t.disabled) return;
    const r = roundOf(G.round);
    const d = t.dataset;
    if (d.new !== undefined) { G.view = 'new'; G.html = ''; paint(); return; }
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
        if (!confirm(`Delete “${r.title}”? Its points come off the leaderboard.`)) return;
        act(() => api(`/${r.id}`, { method: 'DELETE' }), () => { G.view = 'list'; G.round = null; });
        return;
      }
      if (d.host === 'end' && !confirm(r.type === 'contest' ? 'End the competition? Only the top 10 entries are kept; every other entry is deleted.' : 'End this game for everyone?')) return;
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
      G.pair = null;
      act(() => api(`/${r.id}/pick`, json('POST', { winner: d.pick, loser: d.lose })), () => loadPair(r, true));
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
      if (!confirm('Take this entry back? It will be deleted.')) return;
      act(() => api(`/${r.id}/submissions/${encodeURIComponent(d.unsubmit)}`, { method: 'DELETE' }));
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
    pickPhoto(`“${tile.prompt}”: choose one of your photos that fits.`,
      (photo) => act(() => api(`/${r.id}/claims`, json('POST', { tile: index, photo })), () => { G.view = 'round'; }),
      { used, remove: tile.mine ? () => act(() => api(`/${r.id}/claims/${index}`, { method: 'DELETE' }), () => { G.view = 'round'; }) : null });
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
}
