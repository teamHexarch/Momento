// Dev preview: sample data for every page, with no server running. Local only.
// ?dev on any page turns it on (it stays on), ?dev=off turns it off, ?dev=reset starts the sample data again.
// Loaded by assets/api.js. Not published (see .github/workflows/pages.yml).
(() => {
  const KEY = 'momento-dev-state';
  const DAY = 864e5;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const iso = (offset) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const NAMES = ['Maya', 'Sam', 'Jon', 'Lena', 'Ruby'];   // guests (Priya, the sample account, is "You")

  // The same rules as the server's lifecycle(): upcoming, live, wrapping (30 days), kept
  function lifecycle(date) {
    const now = Date.now(), today = day(now);
    const closes = day(Date.parse(`${date}T00:00:00Z`) + 30 * DAY);
    const status = date > day(now + DAY) ? 'upcoming' : date >= day(now - 2 * DAY) ? 'live' : today <= closes ? 'wrapping' : 'kept';
    return { status, closes, open: status !== 'kept' };
  }
  // The same rules as the server's albumLifecycle(): albums with event times take photos from
  // uploadLeadMin before the start until the end, then they're kept
  function albumLifecycle(a) {
    if (!a.startsAt || !a.endsAt) return lifecycle(a.date);
    const now = Date.now();
    const opensAt = Date.parse(a.startsAt) - (a.uploadLeadMin || 0) * 60000, endsAt = Date.parse(a.endsAt);
    const status = now < opensAt ? 'upcoming' : now <= endsAt ? 'live' : 'kept';
    return { status, closes: day(endsAt), open: status === 'live', opensAt: new Date(opensAt).toISOString() };
  }
  const at = (ms) => new Date(ms).toISOString();
  const localAt = (dayOffset, hhmm) => new Date(`${iso(dayOffset)}T${hhmm}`).toISOString();

  // Imaad's own test album: always on today and taking photos, already holding 18 photos
  const imaadsTimes = () => ({ date: iso(0), startsAt: at(Date.now() - 2 * 3600000), endsAt: at(Date.now() + 6 * 3600000) });
  const imaadsAlbum = () => ({ id: 'a7', name: 'Imaad’s 18th', place: '13 Gardiner Road', role: 'host', code: 'M18-IMAD', photos: 18, mine: 6, guests: 9, waiting: 2, hostName: 'Priya Shah',
    ...imaadsTimes(), uploadLeadMin: 30,
    zone: { lat: -37.8355756, lng: 145.0347419, radiusM: 1000 }, venue: { address: '13 Gardiner Road, Hawthorn, Melbourne, Australia', placeId: '' } });

  const seed = () => ({
    signedIn: true,
    seq: 10,
    user: { id: 'dev-user', name: 'Priya Shah', email: 'priya@example.com', avatarUrl: '', emailVerified: true, verificationResendAt: null, plan: 'free', hasPassword: true, providers: [], notify: { photos: true, closing: true, recap: false } },
    seededA7: 2,
    albums: [
      imaadsAlbum(),
      { id: 'a1', name: 'Maya’s 30th', date: iso(0), place: 'Rooftop, Shoreditch', role: 'host', code: 'K7Q-48DM', photos: 24, mine: 9, guests: 12, waiting: 3, hostName: 'Priya Shah',
        startsAt: at(Date.now() - 2 * 3600000), endsAt: at(Date.now() + 4 * 3600000), uploadLeadMin: 60,
        zone: { lat: 51.5246, lng: -0.0786, radiusM: 1000 }, venue: { address: 'Rooftop, Shoreditch, London', placeId: '' } },
      { id: 'a2', name: 'Amira & Joel’s wedding', date: iso(-26), place: 'Kew Gardens', role: 'guest', photos: 212, mine: 31, guests: 86, hostName: 'Amira' },
      { id: 'a3', name: 'Summer BBQ', date: iso(12), place: 'Victoria Park', role: 'host', code: 'B4T-92HX', photos: 0, mine: 0, guests: 1, waiting: 0, hostName: 'Priya Shah',
        startsAt: localAt(12, '13:00'), endsAt: localAt(12, '19:00'), uploadLeadMin: 0,
        zone: { lat: 51.5362, lng: -0.0388, radiusM: 1000 }, venue: { address: 'Victoria Park, London', placeId: '' } },
      { id: 'a4', name: 'Team offsite', date: iso(-9), place: 'Brighton', role: 'host', code: 'T8R-55WN', photos: 148, mine: 40, guests: 21, waiting: 0, hostName: 'Priya Shah' },
      { id: 'a5', name: 'Ruby’s graduation', date: iso(-75), place: 'Manchester', role: 'guest', photos: 96, mine: 12, guests: 34, hostName: 'Ruby' },
      { id: 'a6', name: 'New Year’s Eve', date: iso(-330), place: 'Edinburgh', role: 'host', code: 'N3Y-10EV', photos: 389, mine: 120, guests: 58, waiting: 0, hostName: 'Priya Shah' },
    ],
    invites: [{ id: 'i1', code: 'J2M-7QPC', name: 'Hannah’s housewarming', date: iso(5), place: 'Leeds', by: 'Hannah' }],
  });

  const q = new URLSearchParams(location.search).get('dev');
  let state = null;
  try { if (q === 'reset') localStorage.removeItem(KEY); state = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  state = state || seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} };
  // Browsers already using the preview get the newest version of the album once, keeping their other changes
  if (state.seededA7 !== 2) { state.seededA7 = 2; state.albums = [imaadsAlbum(), ...state.albums.filter((a) => a.id !== 'a7')]; save(); }
  // and it stays live whichever day it's opened
  { const a7 = state.albums.find((a) => a.id === 'a7'); if (a7) { Object.assign(a7, imaadsTimes()); save(); } }
  // Friend groups (added after the rest, so browsers already using the preview get them once)
  const seedGroups = () => {
    const you = { id: 'dev-user', name: 'You', avatarUrl: '', role: 'member', you: true, since: new Date(Date.now() - 40 * DAY).toISOString() };
    const pal = (id, name, role = 'member', days = 30) => ({ id, name, avatarUrl: '', role, you: false, since: new Date(Date.now() - days * DAY).toISOString() });
    state.groups = [
      { id: 'g1', name: 'Uni friends', role: 'owner', members: [{ ...you, role: 'owner' }, pal('u-maya', 'Maya Okafor'), pal('u-sam', 'Sam Reid'), pal('u-jon', 'Jon Park', 'member', 12)],
        invites: [{ id: 'gi1', email: 'lena@example.com', by: 'You', canCancel: true, at: new Date().toISOString() }] },
      { id: 'g2', name: 'Shah family', role: 'member', members: [pal('u-ruby', 'Ruby Shah', 'owner', 90), you, pal('u-dev', 'Dev Shah', 'member', 60), pal('u-ana', 'Ana Shah', 'member', 50), pal('u-kit', 'Kit Shah', 'member', 20), pal('u-oli', 'Oli Shah', 'member', 9), pal('u-nia', 'Nia Shah', 'member', 3)], invites: [] },
    ];
    state.groupInvites = [{ id: 'gv1', group: { id: 'g3', name: 'Thursday book club' }, by: 'Hannah', members: 6, albums: 2, at: new Date().toISOString() }];
    for (const a of state.albums) { if (a.id === 'a1' || a.id === 'a4') a.groupId = 'g1'; if (a.id === 'a5') a.groupId = 'g2'; }
  };
  if (!state.seededGroups) { state.seededGroups = 1; seedGroups(); save(); }
  // A few messages in each sample group's chat
  if (!state.seededChat) {
    state.seededChat = 1;
    const ago = (min) => new Date(Date.now() - min * 60000).toISOString();
    state.chat = {
      g1: [
        { id: 'm1', text: 'Who has the photos from the beach day?', by: 'Maya', you: false, at: ago(300) },
        { id: 'm2', text: 'Uploading mine now, the sunset ones came out great', by: 'Sam', you: false, at: ago(280) },
        { id: 'm3', text: 'Same, adding them tonight', by: 'You', you: true, at: ago(120) },
      ],
      g2: [{ id: 'm4', text: 'Eid album is up, add yours when you can', by: 'Ruby', you: false, at: ago(1440) }],
    };
    save();
  }

  // ---- Photos and album shapes ----
  const picsum = (n, w, h) => `https://picsum.photos/id/${10 + (n * 7) % 50}/${w}/${h}`;
  const salt = (a) => [...a.id].reduce((t, c) => t + c.charCodeAt(0), 0);
  // Photos keep stable ids (album-p<index>); deleted ones are remembered per album and skipped
  const goneOf = (a) => new Set((state.removed || {})[a.id] || []);
  const SAYINGS = ['This one is perfect', 'Haha I love this', 'Need this in full size!', 'Best photo of the night', 'Who took this? So good', 'Framing this one', 'The light here 😍', 'Iconic'];
  const socialOf = (a, i, mine) => {
    const id = `${a.id}-p${i}`;
    if (state.social?.[id]) return state.social[id];
    const n = salt(a) + i * 7;
    const comments = n % 4 === 0 ? Array.from({ length: 1 + (n % 3) }, (_, k) => ({
      id: `${id}-c${k}`, parent: k > 0 && n % 2 === 0 ? `${id}-c0` : null, by: NAMES[(n + k) % NAMES.length], mine: false, text: SAYINGS[(n + k * 3) % SAYINGS.length],
      likes: (n + k * 3) % 5, liked: false,
      at: new Date(Date.now() - (i * 37 + 20 - k * 6) * 60000).toISOString(),
    })) : [];
    return { likes: (n * 5) % 17 < 6 ? 0 : (n * 5) % 17, liked: false, comments };
  };
  const saveSocial = (id, s) => { state.social ||= {}; state.social[id] = s; save(); };
  const photosOf = (a) => {
    const gone = goneOf(a), mineUpTo = a.mineBase ?? a.mine, total = a.photos + gone.size, out = [];
    for (let i = 0; i < total && out.length < Math.min(a.photos, 60); i++) {
      if (gone.has(i)) continue;
      const mine = i < mineUpTo, n = salt(a) + i;
      out.push({ id: `${a.id}-p${i}`, url: picsum(n, 1200, 750), thumbnailUrl: picsum(n, 600, 480), downloadUrl: picsum(n, 1200, 750),
        by: mine ? 'You' : NAMES[(i + 1) % NAMES.length], mine, at: new Date(Date.now() - i * 37 * 60000).toISOString(),
        likes: socialOf(a, i, mine).likes, liked: socialOf(a, i, mine).liked, comments: socialOf(a, i, mine).comments.length });
    }
    return out;
  };
  // Photos you've hidden from your own view (Sort photos), per album, like the server's membership.hidden
  const hiddenOf = (a) => new Set((state.hidden || {})[a.id] || []);
  const visibleOf = (a) => { const h = hiddenOf(a); return photosOf(a).filter((p) => !h.has(p.id)); };
  const hiddenCount = (a) => { const h = hiddenOf(a); return photosOf(a).filter((p) => h.has(p.id)).length; };
  const groupOf = (a) => a.groupId && (state.groups || []).find((g) => g.id === a.groupId);
  const summary = (a) => ({
    id: a.id, name: a.name, date: a.date, place: a.place,
    venue: a.venue?.address || a.venue?.placeId ? a.venue : undefined,
    startsAt: a.startsAt || undefined, endsAt: a.endsAt || undefined,
    uploadLeadMin: a.startsAt ? a.uploadLeadMin || 0 : undefined,
    role: a.role, ...albumLifecycle(a), live: albumLifecycle(a).status === 'live',
    zone: a.zone?.radiusM ? a.zone : undefined, visibility: a.visibility || 'invite',
    code: a.role === 'host' ? a.code : undefined, photos: a.photos - hiddenCount(a), mine: a.mine, guests: a.guests,
    pics: [...visibleOf(a)].sort((x, y) => y.likes - x.likes).slice(0, 9).map((p) => p.thumbnailUrl), hostName: a.hostName, hostIsYou: a.role === 'host',
    ...(groupOf(a) && { group: { id: a.groupId, name: groupOf(a).name }, anywhere: true }),
    ...(a.role === 'host' && { waiting: a.waiting || 0 }),
  });
  const list = () => {
    const withPics = state.albums.filter((a) => a.photos);
    return {
      albums: state.albums.map(summary).sort((a, b) => b.date.localeCompare(a.date)),
      recent: withPics.slice(0, 2).flatMap((a, i) => visibleOf(a).slice(0, 6).map((p, k) => ({ albumId: a.id, photoId: p.id, url: p.thumbnailUrl, by: p.by, at: new Date(Date.now() - (i * 6 + k + 1) * 600000).toISOString() }))),
      feed: withPics.slice(0, 3).map((a, i) => ({ albumId: a.id, by: i === 0 ? 'You' : NAMES[i + 1], n: Math.min(a.photos, 7 + i * 5), pics: visibleOf(a).slice(0, 6).map((p) => p.thumbnailUrl), at: new Date(Date.now() - (i + 1) * 3 * 3600000).toISOString() })),
      invites: state.invites.map((i) => ({ ...i, at: new Date().toISOString() })),
    };
  };
  const newCode = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const p = () => c[Math.floor(Math.random() * c.length)]; return `${p()}${p()}${p()}-${p()}${p()}${p()}${p()}`; };
  const fail = (status, error, code) => ({ status, body: { error, code } });
  function distM(a, b) {
    const R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Five public events around a spot: two you're inside (so you can try joining), the rest a bit further
  function seedEvents(at) {
    const off = (n, e) => ({ lat: at.lat + n / 111320, lng: at.lng + e / (111320 * Math.cos(at.lat * Math.PI / 180)) });
    const H = 3600000, now = Date.now();
    const ev = (id, name, place, n, e, radiusM, startIn, hours, photos, guests, hostName) => {
      const z = off(n, e);
      return { id, name, place, date: day(now + startIn * H), startsAt: at_(now + startIn * H), endsAt: at_(now + (startIn + hours) * H), uploadLeadMin: 30,
        zone: { lat: z.lat, lng: z.lng, radiusM }, venue: { address: place, placeId: '' }, visibility: 'public', role: 'public', photos, mine: 0, guests, hostName };
    };
    const at_ = (ms) => new Date(ms).toISOString();
    return [
      ev('e1', 'City Marathon', 'Riverside start line', 300, -400, 3000, -2, 6, 64, 212, 'Run Club'),
      ev('e2', 'Jazz in the Park', 'Bandstand, Central Park', 900, 600, 1500, -1, 4, 27, 58, 'Lena'),
      ev('e3', 'Night Market', 'Old Warehouse Lane', -1500, 1800, 1000, -1.5, 5, 41, 130, 'Market Co.'),
      ev('e4', 'Open-air Cinema', 'Rooftop Gardens', 2500, 1200, 1500, 5, 3, 6, 34, 'Sam'),
      ev('e5', 'Beach Clean-up', 'North Beach car park', -6000, -4000, 2000, 20, 3, 0, 18, 'Green Team'),
    ];
  }

  // ---- The API ----
  function route(method, path, body, query) {
    // No reCAPTCHA key (so sign-up can't finish in dev mode; log in works), no Google, no Maps key
    if (path === '/api/config') return { body: { captcha: null, googleClientId: null, mapsApiKey: null } };
    if (path === '/api/auth/me') {
      if (method === 'GET') return { body: { user: state.signedIn ? state.user : null } };
      if (!state.signedIn) return fail(401, 'Log in to continue.');
      if (method === 'PATCH') {
        if (typeof body.name === 'string') state.user.name = body.name.trim();
        if (body.notify) Object.assign(state.user.notify, body.notify);
        save(); return { body: { user: state.user } };
      }
      if (method === 'DELETE') { state.signedIn = false; save(); return { body: { ok: true } }; }
    }
    if (/^\/api\/auth\/(login|signup|google|apple)$/.test(path)) {
      state.signedIn = true;
      if (body.name) state.user.name = body.name;
      if (body.email) state.user.email = body.email;
      save(); return { body: { user: state.user } };
    }
    if (path === '/api/auth/logout') { state.signedIn = false; save(); return { body: { ok: true } }; }
    // Email change (approve from the current inbox first) and the reset page. Preview the expired
    // states with ?email-approve=expired and ?reset=expired.
    if (path === '/api/auth/email' && method === 'POST') return { body: { ok: true, pendingEmail: String(body.email || ''), approveFrom: state.user.email } };
    if (path === '/api/auth/email/approve-info') {
      return query.get('token') === 'expired' ? fail(400, 'This link has expired or was already used.', 'invalid')
        : { body: { newEmail: 'new@example.com', email: `${state.user.email.slice(0, 1)}***@${state.user.email.split('@')[1]}` } };
    }
    if (path === '/api/auth/email/approve') return { body: { result: 'approved' } };
    if (path === '/api/auth/email/cancel') { state.signedIn = false; save(); return { body: { result: 'cancelled' } }; }
    if (path === '/api/auth/password/reset') {
      if (body.token === 'expired') return fail(400, 'This reset link has expired or was already used. Ask for a new one.');
      state.signedIn = true; save(); return { body: { user: state.user } };
    }
    if (path.startsWith('/api/auth/') || path === '/api/support') return { body: { ok: true, sent: true, retryAt: new Date(Date.now() + 60000).toISOString(), user: state.user } };
    if (!state.signedIn) return fail(401, 'Log in to continue.');

    // ---- Friend groups ----
    const describeGroup = (g) => ({ ...g, albums: state.albums.filter((a) => a.groupId === g.id).map(summary) });
    const groupOut = () => ({ groups: (state.groups || []).map(describeGroup), invites: state.groupInvites || [] });
    // Leaving a group: albums you were in through it go, albums you host leave the group
    const dropGroup = (g) => {
      state.albums = state.albums.filter((a) => !(a.groupId === g.id && a.viaGroup));
      state.albums.forEach((a) => { if (a.groupId === g.id) delete a.groupId; });
      state.groups = state.groups.filter((x) => x !== g);
    };
    if (path === '/api/groups' && method === 'GET') return { body: groupOut() };
    if (path === '/api/groups' && method === 'POST') {
      const name = String(body.name || '').trim();
      if (!name) return fail(400, 'Give the group a name.');
      const g = { id: 'g' + (++state.seq), name, role: 'owner', members: [{ id: 'dev-user', name: 'You', avatarUrl: '', role: 'owner', you: true, since: new Date().toISOString() }], invites: [] };
      (state.groups ||= []).unshift(g); save();
      return { status: 201, body: { group: describeGroup(g) } };
    }
    const gi = /^\/api\/groups\/invites\/([^/]+)\/(accept|decline)$/.exec(path);
    if (gi && method === 'POST') {
      const inv = (state.groupInvites || []).find((i) => i.id === gi[1]);
      if (!inv) return fail(404, 'That invite has expired or was taken back.');
      state.groupInvites = state.groupInvites.filter((i) => i !== inv);
      if (gi[2] === 'decline') { save(); return { body: { ok: true } }; }
      const g = { id: inv.group.id, name: inv.group.name, role: 'member', invites: [],
        members: [{ id: 'u-hannah', name: 'Hannah Lee', avatarUrl: '', role: 'owner', you: false, since: new Date(Date.now() - 200 * DAY).toISOString() },
          ...['Tom Hale', 'Isla Grey', 'Raj Patel', 'Zoe Fox'].map((n, k) => ({ id: 'u-b' + k, name: n, avatarUrl: '', role: 'member', you: false, since: new Date(Date.now() - (100 - k * 20) * DAY).toISOString() })),
          { id: 'dev-user', name: 'You', avatarUrl: '', role: 'member', you: true, since: new Date().toISOString() }] };
      (state.groups ||= []).unshift(g);
      state.albums.push(
        { id: 'a' + (++state.seq), name: 'Book swap picnic', date: iso(-14), place: 'Regent’s Park', role: 'guest', photos: 32, mine: 0, guests: 6, hostName: 'Hannah', groupId: g.id, viaGroup: true },
        { id: 'a' + (++state.seq), name: 'Author talk night', date: iso(-60), place: 'Daunt Books', role: 'guest', photos: 14, mine: 0, guests: 5, hostName: 'Tom', groupId: g.id, viaGroup: true });
      save();
      return { body: { group: describeGroup(g) } };
    }
    const gm = /^\/api\/groups\/([^/]+)(?:\/(invites|members)(?:\/([^/]+))?)?$/.exec(path);
    const grp = gm && (state.groups || []).find((g) => g.id === gm[1]);
    if (gm && !grp) return fail(404, 'Group not found.');
    if (gm && !gm[2]) {
      if (method === 'GET') return { body: { group: describeGroup(grp) } };
      if (grp.role !== 'owner') return fail(403, 'Only the person who made the group can do that.');
      if (method === 'PATCH') { const n = String(body.name || '').trim(); if (!n) return fail(400, 'Give the group a name.'); grp.name = n; save(); return { body: { group: describeGroup(grp) } }; }
      if (method === 'DELETE') { dropGroup(grp); save(); return { body: { ok: true } }; }
    }
    if (gm && gm[2] === 'invites' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Enter an email address like name@example.com.');
      if (email === state.user.email) return fail(400, 'That’s your own address.');
      grp.invites = grp.invites.filter((i) => i.email !== email);
      grp.invites.unshift({ id: 'gi' + (++state.seq), email, by: 'You', canCancel: true, at: new Date().toISOString() }); save();
      return { status: 201, body: { group: describeGroup(grp) } };
    }
    if (gm && gm[2] === 'invites' && gm[3] && method === 'DELETE') { grp.invites = grp.invites.filter((i) => i.id !== gm[3]); save(); return { body: { ok: true } }; }
    if (gm && gm[2] === 'members' && gm[3] && method === 'DELETE') {
      if (gm[3] === 'me' || gm[3] === 'dev-user') {
        if (grp.role === 'owner') return fail(400, 'You made this group. Delete it instead, or ask someone else to make a new one.');
        dropGroup(grp); save(); return { body: { ok: true } };
      }
      if (grp.role !== 'owner') return fail(403, 'Only the person who made the group can remove people.');
      grp.members = grp.members.filter((x) => x.id !== gm[3]); save();
      return { body: { group: describeGroup(grp) } };
    }
    // The group chat
    const gc = /^\/api\/groups\/([^/]+)\/messages$/.exec(path);
    if (gc) {
      if (!(state.groups || []).some((g) => g.id === gc[1])) return fail(404, 'Group not found.');
      const msgs = ((state.chat ||= {})[gc[1]] ||= []);
      if (method === 'GET') {
        const before = query?.get('before');
        const older = before ? msgs.filter((m) => m.at < before) : msgs;
        return { body: { messages: older.slice(-50), more: older.length > 50 } };
      }
      if (method === 'POST') {
        const text = String(body.text || '').trim();
        if (!text) return fail(400, 'Write a message first.');
        const m = { id: 'm' + (++state.seq), text: text.slice(0, 1000), by: 'You', you: true, at: new Date().toISOString() };
        msgs.push(m); save();
        return { status: 201, body: { message: m } };
      }
    }

    if (path === '/api/events/nearby' && method === 'GET') {
      const at = { lat: Number(query?.get('lat')), lng: Number(query?.get('lng')) };
      if (!Number.isFinite(at.lat) || !Number.isFinite(at.lng)) return fail(400, 'Your location is needed to find events near you.');
      const km = Math.min(100, Math.max(1, Number(query?.get('km')) || 25));
      if (!state.events) { state.events = seedEvents(at); save(); }
      const mineIds = new Set(state.albums.map((a) => a.id));
      const pool = [...state.events.filter((e) => !mineIds.has(e.id)), ...state.albums.filter((a) => a.visibility === 'public' && a.zone?.radiusM)];
      const events = pool.map((e) => {
        const d = Math.round(distM(at, e.zone)), life = albumLifecycle(e);
        return { id: e.id, name: e.name, date: e.date, place: e.place, venue: e.venue, startsAt: e.startsAt, endsAt: e.endsAt, status: life.status, live: life.status === 'live', opensAt: life.opensAt,
          zone: e.zone, distanceM: d, inside: d <= e.zone.radiusM, photos: e.photos, pics: [...visibleOf(e)].sort((x, y) => y.likes - x.likes).slice(0, 9).map((p) => p.thumbnailUrl),
          guests: e.guests, hostName: e.hostName, joined: mineIds.has(e.id) };
      }).filter((e) => e.distanceM <= km * 1000 && e.status !== 'kept').sort((x, y) => (y.live - x.live) || (x.distanceM - y.distanceM));
      return { body: { events } };
    }
    const em = /^\/api\/events\/([^/]+)\/join$/.exec(path);
    if (em && method === 'POST') {
      const e = (state.events || []).find((x) => x.id === em[1]) || state.albums.find((x) => x.id === em[1] && x.visibility === 'public');
      if (!e) return fail(404, 'Event not found.');
      if (state.albums.some((x) => x.id === e.id)) return { body: { already: true, id: e.id } };
      const d = distM({ lat: Number(body.lat), lng: Number(body.lng) }, e.zone), slack = Math.min(200, Number(body.accuracy) || 0);
      if (!(d <= e.zone.radiusM + slack)) {
        const away = d - e.zone.radiusM;
        return fail(403, `You’re ${away >= 1000 ? (away / 1000).toFixed(1) + ' km' : Math.round(away / 10) * 10 + ' m'} outside the zone. Get closer to join.`, 'outside');
      }
      state.albums.unshift({ ...e, role: 'guest', mine: 0, waiting: 0, guests: e.guests + 1 }); save();
      return { status: 201, body: { already: false, id: e.id } };
    }
    if (path === '/api/albums' && method === 'GET') return { body: list() };
    // Deleting a photo: the host can take down any photo in their album, a guest only their own
    const sm = /^\/api\/photos\/(.+)-p(\d+)\/(like|comments)(?:\/([^/]+))?(\/like)?$/.exec(path);
    if (sm) {
      const a = state.albums.find((x) => x.id === sm[1]), i = Number(sm[2]), pid = `${sm[1]}-p${sm[2]}`;
      if (!a || goneOf(a).has(i)) return fail(404, 'Photo not found.');
      const s = structuredClone(socialOf(a, i));
      if (sm[3] === 'like' && method === 'POST') {
        const want = body.liked !== false;
        if (want !== s.liked) { s.liked = want; s.likes = Math.max(0, s.likes + (want ? 1 : -1)); saveSocial(pid, s); }
        return { body: { likes: s.likes, liked: s.liked } };
      }
      const out = (c) => ({ parent: null, likes: 0, liked: false, ...c, canDelete: c.mine || a.role === 'host' });
      if (sm[3] === 'comments' && sm[4] && sm[5] && method === 'POST') {
        const c = s.comments.find((x) => x.id === sm[4]);
        if (!c) return fail(404, 'Comment not found.');
        const want = body.liked !== false;
        if (want !== !!c.liked) { c.liked = want; c.likes = Math.max(0, (c.likes || 0) + (want ? 1 : -1)); saveSocial(pid, s); }
        return { body: { likes: c.likes || 0, liked: !!c.liked } };
      }
      if (sm[3] === 'comments' && method === 'GET') return { body: { comments: s.comments.map(out) } };
      if (sm[3] === 'comments' && method === 'POST') {
        const text = String(body.text || '').trim();
        if (!text) return fail(400, 'Write something first.');
        if (text.length > 500) return fail(400, 'Keep comments under 500 characters.');
        let parent = null;
        if (body.replyTo != null) {
          const to = s.comments.find((x) => x.id === body.replyTo);
          if (!to) return fail(404, 'That comment is gone.');
          parent = to.parent || to.id;
        }
        const c = { id: `${pid}-u${Date.now()}`, parent, by: 'You', mine: true, text, likes: 0, liked: false, at: new Date().toISOString() };
        s.comments.push(c); saveSocial(pid, s);
        return { status: 201, body: { comment: out(c) } };
      }
      if (sm[3] === 'comments' && method === 'DELETE' && sm[4]) {
        const c = s.comments.find((x) => x.id === sm[4]);
        if (!c) return fail(404, 'Comment not found.');
        if (!c.mine && a.role !== 'host') return fail(403, 'Only the person who wrote it or the host can remove it.');
        const before = s.comments.length;
        s.comments = s.comments.filter((x) => x !== c && x.parent !== c.id); saveSocial(pid, s);
        return { body: { ok: true, removed: before - s.comments.length } };
      }
    }
    const pm = /^\/api\/photos\/(.+)-p(\d+)$/.exec(path);
    if (pm && method === 'DELETE') {
      const a = state.albums.find((x) => x.id === pm[1]), i = Number(pm[2]);
      if (!a) return fail(404, 'Photo not found.');
      const gone = goneOf(a), mineUpTo = a.mineBase ?? a.mine;
      if (gone.has(i) || i >= a.photos + gone.size) return fail(404, 'Photo not found.');
      if (a.role !== 'host' && i >= mineUpTo) return fail(403, 'Only the person who added it or the host can remove it.');
      a.mineBase = mineUpTo;
      if (i < mineUpTo) a.mine--;
      a.photos--;
      state.removed = state.removed || {};
      state.removed[a.id] = [...gone, i];
      save();
      return { body: { ok: true } };
    }
    if (path === '/api/albums' && method === 'POST') {
      const name = String(body.name || '').trim();
      if (!name) return fail(400, 'Give the album a name.');
      const a = { id: 'a' + (++state.seq), name, date: body.date || iso(0), place: String(body.place || '').trim(), role: 'host', code: newCode(), photos: 0, mine: 0, guests: 1, waiting: 0, hostName: state.user.name };
      if (body.groupId && (state.groups || []).some((g) => g.id === body.groupId)) a.groupId = body.groupId;
      // Event times, venue and zone, as assets/event.js sends them
      for (const k of ['startsAt', 'endsAt', 'uploadLeadMin', 'zone', 'venue', 'visibility']) if (body[k] != null) a[k] = body[k];
      state.albums.unshift(a); save();
      return { status: 201, body: { album: summary(a) } };
    }
    if (path === '/api/albums/join' && method === 'POST') {
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (code.length !== 7) return fail(400, 'Codes are 7 letters and numbers, like K7Q-48DM.');
      const mineAlready = state.albums.find((a) => a.code && a.code.replace('-', '') === code);
      if (mineAlready) return { body: { already: true, album: summary(mineAlready) } };
      const inv = state.invites.find((i) => i.code.replace('-', '') === code);
      if (!inv) return fail(404, 'No album has that code. Check it against the host’s card.');
      const a = { id: 'a' + (++state.seq), name: inv.name, date: inv.date, place: inv.place, role: 'guest', photos: 18, mine: 0, guests: 9, hostName: inv.by };
      state.albums.unshift(a); state.invites = state.invites.filter((i) => i !== inv); save();
      return { status: 201, body: { already: false, album: summary(a) } };
    }
    const m = /^\/api\/albums\/([^/]+)(?:\/(membership|remind|download|hidden))?$/.exec(path);
    const a = m && state.albums.find((x) => x.id === m[1]);
    if (m && !a) return fail(404, 'Album not found.');
    if (m && !m[2]) {
      if (method === 'GET') {
        const h = hiddenOf(a);
        const photos = query?.get('hidden') === '1' ? photosOf(a).map((p) => (h.has(p.id) ? { ...p, hidden: true } : p)) : visibleOf(a);
        return { body: { album: { ...summary(a), hiddenCount: hiddenCount(a) }, photos } };
      }
      if (a.role !== 'host') return fail(403, 'Only the host can change the album.');
      if (method === 'PATCH') { Object.assign(a, ['name', 'date', 'place'].reduce((o, k) => (body[k] != null ? { ...o, [k]: body[k] } : o), {})); save(); return { body: { album: summary(a) } }; }
      if (method === 'DELETE') { state.albums = state.albums.filter((x) => x !== a); save(); return { body: { ok: true } }; }
    }
    if (m && m[2] === 'membership' && method === 'DELETE') { state.albums = state.albums.filter((x) => x !== a); save(); return { body: { ok: true } }; }
    if (m && m[2] === 'remind' && method === 'POST') return { body: { sent: a.waiting || 0 } };
    if (m && m[2] === 'hidden' && method === 'POST') {
      state.hidden ||= {};
      const h = hiddenOf(a), ids = Array.isArray(body.photoIds) ? body.photoIds : [];
      if (body.all === true && body.hidden === false) h.clear();
      else if (!ids.length) return fail(400, 'Choose the photos to hide or show.');
      else ids.forEach((id) => (body.hidden === false ? h.delete(id) : h.add(id)));
      state.hidden[a.id] = [...h]; save();
      return { body: { hiddenCount: hiddenCount(a) } };
    }
    return fail(404, 'Not found.');
  }

  window.momentoFetch = async (path, opts = {}) => {
    const url = new URL(path, 'http://dev.local');
    let body = {};
    try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) {}
    await sleep(120 + Math.random() * 160);   // a little delay, so loading states show
    const { status = 200, body: out } = route((opts.method || 'GET').toUpperCase(), url.pathname, body, url.searchParams);
    return new Response(JSON.stringify(out), { status, headers: { 'Content-Type': 'application/json' } });
  };

  // Photo uploads use XMLHttpRequest (for progress), so they get a stand-in too: it counts the files in
  // and adds them to the album (as sample photos)
  class FakeXHR extends EventTarget {
    constructor() { super(); this.upload = new EventTarget(); this.status = 0; this.response = null; }
    open(method, url) { this.path = new URL(url, location.href).pathname; }
    setRequestHeader() {}   // uploads send the guest's location (X-Momento-Location); nothing checks it here
    send(form) {
      const m = /^\/api\/albums\/([^/]+)\/photos$/.exec(this.path);
      const files = form instanceof FormData ? form.getAll('photos') : [];
      const total = files.reduce((t, f) => t + (f.size || 1), 0) || 1;
      let loaded = 0;
      const tick = setInterval(() => {
        loaded = Math.min(total, loaded + total / 8);
        this.upload.dispatchEvent(Object.assign(new Event('progress'), { lengthComputable: true, loaded, total }));
        if (loaded < total) return;
        clearInterval(tick);
        this.upload.dispatchEvent(new Event('load'));
        setTimeout(() => {
          const a = state.albums.find((x) => x.id === (m && m[1]));
          if (a) { a.photos += files.length; a.mine += files.length; save(); }
          this.status = a ? 201 : 404;
          this.response = a ? { photos: files.length } : { error: 'Album not found.' };
          this.dispatchEvent(new Event('load'));
        }, 500);
      }, 180);
    }
    abort() {}
  }
  window.XMLHttpRequest = FakeXHR;

  // A small reminder on screen, with the way out
  addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('a');
    b.href = '?dev=off'; b.textContent = 'Dev preview · exit';
    b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:9999;padding:.4rem .85rem;border-radius:100px;font:600 .75rem system-ui,sans-serif;color:#2E2C3A;text-decoration:none;'
      + 'background:rgba(255,255,255,.72);border:1px solid rgba(255,255,255,.85);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 4px 14px -6px rgba(46,44,58,.4)';
    // On a phone-width screen it shrinks to a faint "Dev" tag, so it doesn't look like part of the
    // layout sitting on top of the page
    const narrow = matchMedia('(max-width: 700px)');
    const fit = () => {
      b.textContent = narrow.matches ? 'Dev · exit' : 'Dev preview · exit';
      b.style.opacity = narrow.matches ? '.55' : '1';
      b.style.left = narrow.matches ? 'auto' : '12px';
      b.style.right = narrow.matches ? '8px' : 'auto';
      b.style.bottom = narrow.matches ? 'calc(8px + env(safe-area-inset-bottom, 0px))' : '12px';
    };
    narrow.addEventListener('change', fit);
    fit();
    document.body.append(b);
  });
})();
