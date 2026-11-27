(() => {
    let restoreCursor;
    const joinModal = document.getElementById('joinModal');
    const joinForm = document.getElementById('joinForm');
    const joinCode = document.getElementById('joinCode');
    const joinNote = document.getElementById('joinNote');
    joinModal.addEventListener('close', () => { document.documentElement.classList.toggle('has-cursor', restoreCursor); });
    joinModal.addEventListener('pointerdown', (e) => { joinModal._downOutside = e.target === joinModal; }); joinModal.addEventListener('click', (e) => { if (e.target === joinModal && joinModal._downOutside) joinModal.close(); });
    joinModal.querySelector('[data-close]').addEventListener('click', () => joinModal.close());
    joinModal.addEventListener('cancel', (e) => { e.preventDefault(); joinModal.close(); });
    // Opened empty from the hero, or with a code already typed when it comes from an invite
    const otp = document.getElementById('joinOtp');
    const otpBoxes = [...otp.querySelectorAll('input')];
    const CODE_CHAR = /[^A-Z0-9]/g;
    // The hidden field holds the whole code (K7Q-48DM) for the form
    function syncOtp() {
      const chars = otpBoxes.map((b) => b.value).join('');
      joinCode.value = chars.length > 3 ? chars.slice(0, 3) + '-' + chars.slice(3) : chars;
      otpBoxes.forEach((b) => b.classList.toggle('is-filled', !!b.value));
      otp.classList.remove('is-error');
      return chars;
    }
    function setOtp(code) {
      const chars = String(code || '').toUpperCase().replace(CODE_CHAR, '').slice(0, 7);
      otpBoxes.forEach((b, i) => { b.value = chars[i] || ''; });
      syncOtp();
    }
    const focusOtp = () => (otpBoxes.find((b) => !b.value) || otpBoxes[otpBoxes.length - 1]).focus();
    // Typing or pasting into any box fills it and the boxes after it; the last one sends the form
    function fillFrom(i, text) {
      const chars = text.toUpperCase().replace(CODE_CHAR, '');
      if (!chars) { syncOtp(); return; }
      for (let k = 0; k < chars.length && i + k < otpBoxes.length; k++) otpBoxes[i + k].value = chars[k];
      const next = Math.min(i + chars.length, otpBoxes.length - 1);
      const full = syncOtp().length === 7;
      otpBoxes[next].focus();
      if (full && i + chars.length >= 7) joinForm.requestSubmit();
    }
    otpBoxes.forEach((box, i) => {
      box.addEventListener('focus', () => box.select());
      box.addEventListener('input', () => {
        const v = box.value; box.value = '';
        fillFrom(i, v);
      });
      box.addEventListener('paste', (e) => { e.preventDefault(); fillFrom(i, e.clipboardData?.getData('text') || ''); });
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !box.value && i > 0) { e.preventDefault(); otpBoxes[i - 1].value = ''; otpBoxes[i - 1].focus(); syncOtp(); }
        else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); otpBoxes[i - 1].focus(); }
        else if (e.key === 'ArrowRight' && i < otpBoxes.length - 1) { e.preventDefault(); otpBoxes[i + 1].focus(); }
      });
    });
    function otpError() {
      otp.classList.add('is-error'); otp.classList.remove('is-shake');
      void otp.offsetWidth; otp.classList.add('is-shake');
    }
    function openJoin(code = '') {
      setOtp(code); joinNote.textContent = ''; joinNote.classList.remove('error');
      if (!joinModal.open) {
        restoreCursor = document.documentElement.classList.contains('has-cursor');
        document.documentElement.classList.remove('has-cursor');
        joinModal.showModal();
      }
      focusOtp();
    }
    document.getElementById('joinOpen').addEventListener('click', () => openJoin());
    // QR codes (assets/qr.js): the scanner's "Type the code" opens this window, and a scanned code joins here
    // (this runs before the shared script, so window.Momento may not exist yet)
    const MQ = (window.Momento ||= {});
    MQ.eventAdmission = async (path, body) => {
      try { return await momentoApi(path, momentoJson('POST', body)); }
      catch (err) { if (err.code !== 'check-location') throw err; }
      let location = null;
      try { if (!MQ.permission || await MQ.permission.ensure('location')) location = await MQ.event.locate(); } catch {}
      return momentoApi(path, momentoJson('POST', { ...body, location }));
    };
    MQ.openJoin = (code) => openJoin(code);
    MQ.joinFromQr = (code) => submitInvite(code);
    document.getElementById('joinScan').addEventListener('click', () => {
      joinModal.close();
      Momento.qr?.scan(document.getElementById('joinOpen'));
    });

    // Open the form after sign-in for invitation links and footer shortcuts.
    const joinFromHash = () => {
      if (location.hash !== '#join') return;
      history.replaceState(null, '', location.pathname + location.search);
      openJoin();
    };
    addEventListener('hashchange', joinFromHash);
    joinForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = joinCode.value.trim().toUpperCase().replace(/\s/g, '');
      if (!/^[A-Z0-9]{3}-?[A-Z0-9]{4}$/.test(code)) {
        joinNote.classList.add('error');
        joinNote.textContent = 'Codes are 7 letters and numbers, like K7Q-48DM.';
        otpError(); focusOtp(); return;
      }
      joinNote.classList.remove('error');
      const button = joinForm.querySelector('[type="submit"]');
      if (button.disabled) return;
      button.disabled = true;
      // Not logged in: show what the album is (no login needed for that), then ask to log in. The
      // code goes with them, so they're joined as soon as they're back
      if (!(await MQ.sessionReady?.catch?.(() => null))) {
        try { await guestJoin(code); }
        catch (err) { joinNote.classList.add('error'); joinNote.textContent = err.message; otpError(); }
        finally { button.disabled = false; }
        return;
      }
      try {
        const { album, pending } = await MQ.eventAdmission('/api/albums/join', { code });
        if (pending) { joinNote.textContent = 'Your request is waiting for the host.'; loadJoined(); return; }
        joinModal.close();
        openAlbumHere(album.id);
      } catch (err) { joinNote.classList.add('error'); joinNote.textContent = err.message; otpError(); }
      finally { button.disabled = false; }
    });


    async function guestJoin(code) {
      const clean = code.replace('-', '');
      const { album } = await momentoApi('/api/albums/preview/' + encodeURIComponent(clean));
      joinModal.close();
      MQ.needLogin({ action: 'join', next: 'events?join=' + encodeURIComponent(album.code || clean), album });
    }

    function submitInvite(code) {
      if (!/^[A-Z0-9]{3}-?[A-Z0-9]{4}$/i.test(code)) {
        openJoin();
        joinNote.textContent = 'This invitation is invalid. Enter the code from your host.';
        return;
      }
      openJoin(code);
      joinForm.requestSubmit();
    }

    // ---- Albums open right here: the My albums window (albums.html?embed=1) over this page ----
    const viewer = document.createElement('dialog');
    viewer.id = 'eaViewer';
    viewer.setAttribute('aria-label', 'Album');
    viewer.innerHTML = '<p class="ea-viewer-wait" role="status">Opening album…</p>';
    document.addEventListener('DOMContentLoaded', () => document.body.append(viewer));
    let frame = null;
    // If the album window never reports back (it failed, or the connection stalled), don't wait for ever:
    // say what happened and close "Opening album…"
    let watchdog = 0;
    const stopWatch = () => { clearTimeout(watchdog); watchdog = 0; };
    function giveUp(message) {
      MQ.toast?.('Couldn’t open the album', message || 'It took too long. Check your connection and try again.');
      closeViewer();
    }
    // The open album is kept in the address (?album=<id>), so a reload opens it again
    function keepAlbum(id) {
      const u = new URL(location.href);
      if (id) u.searchParams.set('album', id); else u.searchParams.delete('album');
      if (u.href !== location.href) history.replaceState(history.state, '', u);
    }
    function closeViewer() {
      stopWatch();
      keepAlbum('');
      if (viewer.open) viewer.close();
      frame?.remove(); frame = null;
      viewer.classList.remove('is-ready');
      void loadJoined();
    }
    viewer.addEventListener('close', () => keepAlbum(''));
    viewer.addEventListener('cancel', (e) => {
      // Esc goes to the album window first, so it can close itself the way it always does
      e.preventDefault();
      if (!viewer.classList.contains('is-ready')) { closeViewer(); return; }
      // Focus is on this page: hand Esc to the album window, which fades out and then tells us
      const modal = frame?.contentDocument?.getElementById('albumModal');
      if (modal?.open) modal.dispatchEvent(new frame.contentWindow.Event('cancel', { cancelable: true }));
      else closeViewer();
    });
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || !frame || e.source !== frame.contentWindow || e.data?.type !== 'momento:album') return;
      if (e.data.state === 'ready') { stopWatch(); viewer.classList.add('is-ready'); frame.focus(); }
      else if (e.data.state === 'failed') giveUp(e.data.message);
      else closeViewer();
    });
    // focus: { photos: 'id,id', by } opens the album showing just those photos (from a notification)
    function openAlbumHere(id, upload = false, focus = {}) {
      if (!id || !/^[\w-]{1,64}$/.test(id)) return;
      document.querySelectorAll('dialog[open]').forEach((d) => { if (d !== viewer) d.close(); });
      frame?.remove();
      frame = document.createElement('iframe');
      frame.title = 'Album';
      frame.allow = 'camera; geolocation; clipboard-write; web-share';
      frame.src = 'albums?album=' + encodeURIComponent(id) + '&embed=1' + (upload ? '&upload=1' : '')
        + (focus.photos ? '&photos=' + encodeURIComponent(focus.photos) + (focus.by ? '&by=' + encodeURIComponent(focus.by) : '') : '')
        // (the local sample-data preview: carried into the frame when it's on; ?dev=off must not turn it back on)
        + (/[?&]dev(?!=off)\b/.test(location.search) ? '&dev' : '');
      viewer.classList.remove('is-ready');
      viewer.append(frame);
      if (!viewer.open) viewer.showModal();
      keepAlbum(id);
      stopWatch();
      watchdog = setTimeout(() => { if (viewer.open && !viewer.classList.contains('is-ready')) giveUp(); }, 15000);
    }
    MQ.openAlbumHere = openAlbumHere;
    // Any link to an album on this page (cards, the map, "View album" after creating) opens it here
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/\/albums(\.html)?$/.test(url.pathname)) return;
      // The album's id is only the album= part: a link from a notification about new photos carries more
      // after it (#album=<id>&photos=<id,id>&by=<who>), which used to end up in the id, so nothing opened
      const hash = new URLSearchParams(url.hash.slice(1));
      const id = url.searchParams.get('album') || hash.get('album');
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      openAlbumHere(id, false, { photos: hash.get('photos') || url.searchParams.get('photos') || '', by: hash.get('by') || url.searchParams.get('by') || '' });
    }, true);

    // ---- Events you host: a row each, and a sheet to manage who gets in ----
    const joined = document.getElementById('joinedEvents');
    const total = document.getElementById('eaTotal');
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (n) => Number(n || 0).toLocaleString('en-GB');
    const day = (d) => { const t = Date.parse(String(d).slice(0, 10) + 'T12:00:00Z'); return Number.isNaN(t) ? String(d || '') : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
    const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const ORDER = { live: 0, upcoming: 1, wrapping: 2, kept: 3 };
    const ICON = {
      gate: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M2 21h20M14 12h.01"/></svg>',
      gear: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
      chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
      close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    };
    const waitingOf = (a) => (a.requests || []).filter((r) => r.status === 'pending' || r.status === 'approving');
    let byId = new Map();
    let me = '';

    function statusOf(a) {
      const key = ORDER[a.status] === undefined ? 'kept' : a.status;
      const label = key === 'live' ? 'Live now'
        : key === 'upcoming' ? (a.opensAt ? 'Opens ' + when(a.opensAt) : 'Coming up')
        : key === 'wrapping' ? 'Open until ' + day(a.closes) : 'Kept';
      return { key, label };
    }
    function policy(a) {
      if (a.role !== 'host') return '';
      const deadline = a.joinDeadline && new Date(a.joinDeadline);
      const shut = a.joiningOpen === false || (deadline && deadline <= new Date());
      const bits = [
        `<span class="${shut ? 'off' : ''}">${shut ? 'Joining closed' : deadline ? 'Joining until ' + when(deadline) : 'Joining open'}</span>`,
        a.zone && !a.group ? `<span class="${a.locationRequired === false ? 'off' : ''}">${a.locationRequired === false ? 'No location check' : 'Location check'}</span>` : '',
      ];
      return `<div class="ea-policy">${bits.join('')}</div>`;
    }

    // ---- An event you host, as a row: its photo, where it stands, how joining is set up, and Settings ----
    function hostRow(a) {
      const el = document.createElement('article');
      el.className = 'eh panel';
      el.dataset.id = a.id;
      const pic = a.cover?.thumbUrl || (a.pics || [])[0];   // the host's cover while upcoming, then the most loved photo
      const waiting = waitingOf(a).length;
      const place = a.venue?.address || (window.Momento?.event?.isPlaceholder?.(a.place) ? '' : a.place);
      const s = statusOf(a);
      el.innerHTML = `
        <span class="eh-pic" aria-hidden="true">${pic ? `<img src="${esc(pic)}" alt="" loading="lazy" decoding="async">` : esc((a.name.trim()[0] || '·').toUpperCase())}</span>
        <div class="eh-text">
          <h3><a class="eh-open" href="albums?album=${encodeURIComponent(a.id)}">${esc(a.name)}</a></h3>
          <p class="eh-meta"><span class="eh-state is-${s.key}"><i></i>${esc(s.label)}</span><span>${esc([day(a.date), place].filter(Boolean).join(', '))}</span></p>
          ${policy(a)}
        </div>
        <button class="ea-chip" type="button" data-sheet="manage">${ICON.gear}Settings${waiting ? `<b class="ea-badge" aria-label="${waiting} waiting">${waiting}</b>` : ''}</button>`;
      el.querySelector('[data-sheet]').addEventListener('click', (e) => openSheet(a.id, 'manage', e.currentTarget));
      window.lightUp?.(el);
      return el;
    }

    // Settings (hosts) live in assets/album-settings.js, so every page opens the same sheet
    const openSheet = (id, focus, from) => Momento.albumSettings?.open(id, from);

    // ---- "Needs you": rows for invitations and for guests waiting at the door ----
    // The Social page stacks these above everything else (and hides the stack when there are none).
    // They look like a friend group's invite, so every question waiting for you reads the same way.
    const ROW_ICON = {
      mail: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/></svg>',
      guest: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.6-3.6 3.1-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><path d="M19 8v6M16 11h6"/></svg>',
    };
    function needRow(icon, text, sub, label) {
      const el = document.createElement('article');
      el.className = 'gri panel';
      el.innerHTML = `<i class="gri-ic" aria-hidden="true">${icon}</i><p class="gri-text">${text}<small>${sub}</small></p><div class="gri-acts"><button class="btn btn-dark" type="button">${label}</button></div>`;
      window.rollButton?.(el.querySelector('.btn'));
      window.lightUp?.(el);
      return el;
    }
    function inviteRow(inv) {
      const el = needRow(
        ROW_ICON.mail,
        inv.by ? `<b>${esc(inv.by)}</b> invited you to <b>${esc(inv.name)}</b>` : `You’re invited to <b>${esc(inv.name)}</b>`,
        esc(inv.date ? day(inv.date) : 'Event album'),
        'Join album');
      el.querySelector('.btn').addEventListener('click', () => submitInvite(inv.code));
      return el;
    }
    function waitingRow(a) {
      const w = waitingOf(a), names = w.map((r) => r.name || 'Guest');
      const el = needRow(
        ROW_ICON.guest,
        `<b>${w.length === 1 ? '1 person is' : w.length + ' people are'} waiting</b> to join <b>${esc(a.name)}</b>`,
        esc(names.slice(0, 3).join(', ') + (names.length > 3 ? ` and ${names.length - 3} more` : '')),
        'Review');
      el.querySelector('.btn').addEventListener('click', (e) => openSheet(a.id, 'manage', e.currentTarget));
      return el;
    }

    async function loadJoined() {
      try {
        const { albums, invites = [] } = await momentoApi('/api/albums');
        const events = albums
          .sort((x, y) => ((ORDER[x.status] ?? 3) - (ORDER[y.status] ?? 3)) || String(y.date).localeCompare(String(x.date)));
        byId = new Map(events.map((a) => [a.id, a]));
        const hosted = events.filter((a) => a.role === 'host');
        document.getElementById('eaInvites').replaceChildren(...invites.map(inviteRow));
        document.getElementById('eaWaiting').replaceChildren(...hosted.filter((a) => waitingOf(a).length).map(waitingRow));
        // Only events you host are listed on this page: they're the ones with settings. Every album you're
        // in, hosted or not, is in My albums
        total.textContent = hosted.length ? String(hosted.length) : '';
        document.getElementById('soHosting').hidden = !hosted.length;
        joined.replaceChildren(...hosted.map(hostRow));
        // Requests you've made to join someone else's event
        const section = document.getElementById('admission-status');
        const { requests = [] } = await momentoApi('/api/events/requests').catch(() => ({}));
        section.hidden = requests.length === 0;
        section.querySelector('ul').innerHTML = requests.map((r) => `<li class="ea-req glass${r.status === 'declined' ? ' is-declined' : ''}"><i aria-hidden="true"></i><b>${esc(r.name)}</b><span>${r.status === 'declined' ? 'The host declined' : 'Waiting for the host'}</span></li>`).join('');
      } catch (err) { MQ.toast?.('Couldn’t load your events', err.message); }
    }
    // The Social page waits for this (and for the groups) before it shows its sections, so nothing jumps
    const joinedReady = () => document.dispatchEvent(new Event('momento:joined-ready'));
    document.addEventListener('DOMContentLoaded', async () => {
      const code = new URLSearchParams(location.search).get('join');
      if (code) {
        try { localStorage.setItem('momento-pending-join', JSON.stringify({ code, at: Date.now() })); } catch {}
      }
      try {
        const user = await Momento.sessionReady;
        // A visitor with an invite link or QR code: show the album and ask them to log in
        if (!user && code) { joinedReady(); guestJoin(code).catch(() => openJoin(code)); return; }
        if (!user?.emailVerified) { joinedReady(); return; }
        me = user.name || '';
      } catch (err) { joined.textContent = err.message; joinedReady(); return; }
      loadJoined().finally(joinedReady);
      // Reloaded with an album open: open it again
      const again = new URLSearchParams(location.search).get('album');
      if (again && !code) openAlbumHere(again);
      if (code) {
        try { localStorage.removeItem('momento-pending-join'); } catch {}
        submitInvite(code);
      } else joinFromHash();
      document.addEventListener('momento:albums', loadJoined);
    });
})();
