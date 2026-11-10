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
      try {
        const { album, pending } = await MQ.eventAdmission('/api/albums/join', { code });
        if (pending) { joinNote.textContent = 'Your request is waiting for the host.'; loadJoined(); return; }
        joinModal.close();
        openAlbumHere(album.id);
      } catch (err) { joinNote.classList.add('error'); joinNote.textContent = err.message; otpError(); }
      finally { button.disabled = false; }
    });


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
    function closeViewer() {
      if (viewer.open) viewer.close();
      frame?.remove(); frame = null;
      viewer.classList.remove('is-ready');
      void loadJoined();
    }
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
      if (e.data.state === 'ready') { viewer.classList.add('is-ready'); frame.focus(); }
      else closeViewer();
    });
    function openAlbumHere(id, upload = false) {
      if (!id) return;
      document.querySelectorAll('dialog[open]').forEach((d) => { if (d !== viewer) d.close(); });
      frame?.remove();
      frame = document.createElement('iframe');
      frame.title = 'Album';
      frame.allow = 'camera; geolocation; clipboard-write; web-share';
      frame.src = 'albums.html?album=' + encodeURIComponent(id) + '&embed=1' + (upload ? '&upload=1' : '') + (/[?&]dev\b/.test(location.search) ? '&dev' : '');
      viewer.classList.remove('is-ready');
      viewer.append(frame);
      if (!viewer.open) viewer.showModal();
    }
    MQ.openAlbumHere = openAlbumHere;
    // Any link to an album on this page (cards, the map, "View album" after creating) opens it here
    document.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !/\/albums\.html$/.test(url.pathname)) return;
      const id = url.searchParams.get('album') || (url.hash.match(/^#album=(.+)$/) || [])[1];
      if (!id) return;
      e.preventDefault(); e.stopPropagation();
      openAlbumHere(decodeURIComponent(id));
    }, true);

    // ---- Your event albums: cards like My albums (the cover tilts toward the cursor, the photo
    // drifts as you scroll, three prints fan out on hover), and a sheet to manage joining and chat ----
    const joined = document.getElementById('joinedEvents');
    const total = document.getElementById('eaTotal');
    const sheetDialog = document.getElementById('eaDialog');
    const sheet = document.getElementById('eaSheet');
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const fine = matchMedia('(pointer: fine)').matches;
    const mix = (a, b, t) => a + (b - a) * t;
    const lim = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = (n) => Number(n || 0).toLocaleString('en-GB');
    const day = (d) => { const t = Date.parse(String(d).slice(0, 10) + 'T12:00:00Z'); return Number.isNaN(t) ? String(d || '') : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
    const when = (iso) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const ORDER = { live: 0, upcoming: 1, wrapping: 2, kept: 3 };
    const ICON = {
      gate: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16"/><path d="M2 21h20M14 12h.01"/></svg>',
      gear: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
      chev: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
      chat: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>',
      close: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    };
    const waitingOf = (a) => (a.requests || []).filter((r) => r.status === 'pending' || r.status === 'approving');
    let byId = new Map();
    let me = '';

    function statusTag(a) {
      const s = ORDER[a.status] === undefined ? 'kept' : a.status;
      const label = s === 'live' ? 'Live now'
        : s === 'upcoming' ? (a.opensAt ? 'Opens ' + when(a.opensAt) : 'Coming up')
        : s === 'wrapping' ? 'Open until ' + day(a.closes) : 'Kept';
      return `<span class="ea-tag is-${s}"><i></i>${esc(label)}</span>`;
    }
    function policy(a) {
      if (a.role !== 'host') return '';
      const deadline = a.joinDeadline && new Date(a.joinDeadline);
      const shut = a.joiningOpen === false || (deadline && deadline <= new Date());
      const bits = [
        `<span class="${shut ? 'off' : ''}">${shut ? 'Joining closed' : deadline ? 'Joining until ' + when(deadline) : 'Joining open'}</span>`,
        a.zone && !a.group ? `<span class="${a.locationRequired === false ? 'off' : ''}">${a.locationRequired === false ? 'No location check' : 'Location check'}</span>` : '',
        `<span class="${a.chatEnabled ? '' : 'off'}">${a.group ? (a.chatEnabled ? 'Guest chat on' : 'Guest chat off') : (a.chatEnabled ? 'Chat on' : 'Chat off')}</span>`,
      ];
      return `<div class="ea-policy">${bits.join('')}</div>`;
    }

    // ---- Motion: tilt toward the cursor, lean with scroll position, bend a little with scroll speed ----
    const visible = new Set();
    const W = { y: scrollY, v: 0, s: 0, a: 0 };
    let raf = 0, last = 0;
    const kick = () => { if (!raf && !still) raf = requestAnimationFrame(tick); };
    function tick(now) {
      raf = 0;
      const dt = last ? Math.min((now - last) / 1000, .05) : 0;
      last = now;
      if (dt) W.v = mix(W.v, (scrollY - W.y) / dt, 1 - Math.exp(-dt * 10));
      W.y = scrollY; W.s = lim(W.v / 2000, -1, 1); W.a = Math.abs(W.s);
      let moving = W.a > .003;
      const vh = innerHeight;
      for (const el of visible) {
        const t = el.tilt, r = el.cover.getBoundingClientRect();
        const p = lim((r.top + r.height / 2) / vh * 2 - 1, -1, 1);
        const hx = t.over ? t.hx - .5 : 0, hy = t.over ? t.hy - .5 : 0;
        const x = mix(t.x, -hy * 10 + p * 5, .12), y = mix(t.y, hx * 12, .12), g = mix(t.g, t.over ? 1 : 0, .1);
        if (Math.abs(x - t.x) + Math.abs(y - t.y) + Math.abs(g - t.g) > .002) moving = true;
        t.x = x; t.y = y; t.g = g;
        const ct = `perspective(1000px) rotateX(${(t.x + W.s * 12).toFixed(2)}deg) rotateY(${t.y.toFixed(2)}deg) skewY(${(W.s * 2.5).toFixed(2)}deg) scale(${(1 - W.a * .04).toFixed(3)}, ${(1 + W.a * .06).toFixed(3)})`;
        if (ct !== el._ct) el.cover.style.transform = el._ct = ct;
        if (el.img) {
          const it = `translate3d(0, ${(p * -6).toFixed(2)}%, 0) scale(${(1.14 + W.a * .14).toFixed(3)})`;
          if (it !== el._it) el.img.style.transform = el._it = it;
        }
        el.cover.style.setProperty('--glare', t.g.toFixed(3));
        el.cover.style.setProperty('--gx', `${(t.hx * 100).toFixed(1)}%`);
        el.cover.style.setProperty('--gy', `${(t.hy * 100).toFixed(1)}%`);
      }
      if (moving) kick(); else last = 0;
    }
    addEventListener('scroll', kick, { passive: true });
    addEventListener('resize', kick, { passive: true });
    const onScreen = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); visible.add(e.target); }
        else visible.delete(e.target);
      }
      kick();
    }, { rootMargin: '80px 0px' }) : null;

    function card(a, wide) {
      const el = document.createElement('article');
      el.className = 'ea' + (wide ? ' wide' : '');
      el.dataset.id = a.id;
      const pics = a.pics || [];
      const waiting = waitingOf(a).length;
      const place = a.venue?.address || a.place;
      const host = a.role === 'host';
      el.innerHTML = `
        <div class="ea-frame glass">
          <div class="ea-media">
            <span class="ea-cover">${pics.length ? `<img src="${esc(pics[0])}" alt="" loading="lazy" decoding="async">` : `<span class="ea-new" aria-hidden="true"><b>${esc((a.name.trim()[0] || '·').toUpperCase())}</b><small>No photos yet</small></span>`}${statusTag(a)}</span>
            ${pics.length > 3 ? `<span class="ea-fan" aria-hidden="true">${[1, 2, 3].map((k) => `<span class="ea-fp"><img src="${esc(pics[k])}" alt="" loading="lazy" decoding="async"></span>`).join('')}</span>` : ''}
          </div>
          <div class="ea-body">
            <h3 class="ea-name"><a class="ea-open" href="albums.html?album=${encodeURIComponent(a.id)}">${esc(a.name)}</a></h3>
            <span class="ea-when">${esc([day(a.date), place, a.group && 'In ' + a.group.name].filter(Boolean).join(' · '))}</span>
            <span class="ea-foot"><span>${a.photos ? num(a.photos) + (a.photos === 1 ? ' photo' : ' photos') : 'Waiting for the first photos'}${a.guests ? ' · ' + num(a.guests) + (a.guests === 1 ? ' guest' : ' guests') : ''}</span><span class="ea-role${host ? ' host' : ''}">${host ? 'You’re hosting' : a.hostName ? 'Host: ' + esc(a.hostName.trim().split(/\s+/)[0]) : 'Joined'}</span></span>
            ${policy(a)}
            <div class="ea-acts">${host ? `<button class="ea-chip" type="button" data-sheet="manage">${ICON.gear}Settings${waiting ? `<b class="ea-badge" aria-label="${waiting} waiting">${waiting}</b>` : ''}</button>` : ''}${a.group && a.anywhere ? `<a class="ea-chip" href="groups.html#chat=${encodeURIComponent(a.group.id)}">${ICON.chat}Chat in ${esc(a.group.name)}</a>` : ''}</div>
            ${a.chatEnabled ? chatBox(a) : ''}
          </div>
        </div>`;
      const frame = el.querySelector('.ea-frame');
      el.cover = el.querySelector('.ea-cover');
      el.img = el.cover.querySelector('img');
      el.tilt = { x: 0, y: 0, g: 0, hx: .5, hy: .5, over: false };
      if (fine && !still) {
        el.addEventListener('pointerenter', () => { el.tilt.over = true; frame.style.setProperty('--shine', 1); kick(); });
        el.addEventListener('pointerleave', () => { el.tilt.over = false; frame.style.setProperty('--shine', 0); kick(); });
        el.addEventListener('pointermove', (e) => {
          const r = el.cover.getBoundingClientRect(), f = frame.getBoundingClientRect();
          el.tilt.hx = lim((e.clientX - r.left) / r.width, 0, 1);
          el.tilt.hy = lim((e.clientY - r.top) / r.height, 0, 1);
          frame.style.setProperty('--mx', `${e.clientX - f.left}px`);
          frame.style.setProperty('--my', `${e.clientY - f.top}px`);
          kick();
        }, { passive: true });
      }
      el.querySelectorAll('[data-sheet]').forEach((b) => b.addEventListener('click', () => openSheet(a.id, b.dataset.sheet, b)));
      const chat = el.querySelector('.ea-chatbox');
      if (chat) { chat.querySelectorAll('.btn').forEach((b) => window.rollButton?.(b)); setUpChat(a, chat); }
      if (onScreen) onScreen.observe(el); else el.classList.add('is-in');
      return el;
    }

    // ---- Settings (hosts): who gets in, the event chat switch, and people waiting to be let in ----
    let sheetId = null, sheetFocus = 'manage', opener = null;
    const api = (id) => '/api/events/' + encodeURIComponent(id);
    function say(text, bad) {
      const s = sheet.querySelector('.ea-status');
      if (!s) return;
      s.textContent = text || '';
      s.classList.toggle('error', !!bad);
    }
    function closeSheet() { if (sheetDialog.open) sheetDialog.close(); }
    sheetDialog.addEventListener('close', () => {
      sheetId = null;
      if (opener?.isConnected) opener.focus();
    });
    sheetDialog.addEventListener('pointerdown', (e) => { sheetDialog._downOutside = e.target === sheetDialog; });
    sheetDialog.addEventListener('click', (e) => { if (e.target === sheetDialog && sheetDialog._downOutside) closeSheet(); });

    function openSheet(id, focus, from) {
      sheetId = id; sheetFocus = focus; opener = from || opener;
      renderSheet();
      if (!sheetDialog.open) sheetDialog.showModal();
      const target = sheet.querySelector('.acct-sw, .ea-x');
      target?.focus();
    }
    function renderSheet() {
      const a = byId.get(sheetId);
      if (!a) { closeSheet(); return; }
      const host = a.role === 'host';
      const waiting = waitingOf(a);
      const deadline = a.joinDeadline ? new Date(a.joinDeadline) : null;
      const local = deadline ? new Date(+deadline - deadline.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '';
      const sw = (key, on, title, note, disabled) => `<div class="ea-row"><span><b id="eaL-${key}">${title}</b><small>${note}</small></span><button class="acct-sw" type="button" role="switch" data-key="${key}" aria-labelledby="eaL-${key}" aria-checked="${on}"${disabled ? ' disabled' : ''}></button></div>`;
      const km = a.zone?.radiusM ? `${+(a.zone.radiusM / 1000).toFixed(1)} km` : '';
      sheet.innerHTML = `
        <button class="acct-x ea-x" type="button" aria-label="Close" data-close>${ICON.close}</button>
        <p class="ea-kicker">Settings</p>
        <h2 id="eaTitle">${esc(a.name)}</h2>
        <p class="ea-sub">${esc([day(a.date), a.venue?.address || a.place].filter(Boolean).join(' · '))}</p>
        ${host ? `
        <section class="ea-sec" aria-labelledby="eaRules">
          <h3 id="eaRules">Who gets in</h3>
          ${sw('joiningOpen', a.joiningOpen !== false, 'Accept new guests', 'When off, anyone with the code asks you first')}
          ${a.group ? '' : sw('locationRequired', !!a.zone && a.locationRequired !== false, 'Check location on entry', a.zone ? `Guests within ${km} of the venue get straight in. Anyone else waits for you` : 'Add a venue to the album to use this', !a.zone)}
          ${a.group
            ? sw('chatEnabled', !!a.chatEnabled, 'Chat for outside guests', `${esc(a.group.name)} keeps talking in its group chat. Turn this on if people outside the group joined: they see this chat, not the group’s`)
            : sw('chatEnabled', !!a.chatEnabled, 'Event chat', 'A chat under this album for everyone in it')}
          <label class="ea-row ea-deadline"><span><b>Join deadline</b><small>Leave empty to close joining when the event ends</small></span><input type="datetime-local" id="eaDeadline" value="${local}"></label>
        </section>
        <section class="ea-sec" aria-labelledby="eaReqs">
          <h3 id="eaReqs">Waiting for you ${waiting.length ? `<b class="ea-badge">${waiting.length}</b>` : ''}</h3>
          ${waiting.length ? `<ul class="ea-reqs">${waiting.map((r) => `
            <li data-guest="${esc(r.user)}"><i class="ea-av" aria-hidden="true">${esc((String(r.name || 'G').trim()[0] || 'G').toUpperCase())}</i>
              <span><b>${esc(r.name || 'Guest')}</b><small>${r.status === 'approving' ? 'Being let in…' : 'Asked to join'}</small></span>
              <button class="ea-mini dark" type="button" data-approve="1">Approve</button><button class="ea-mini" type="button" data-approve="0">Decline</button></li>`).join('')}</ul>`
          : '<p class="ea-none">No one is waiting. Guests who can’t check in, or who try after joining closes, show up here.</p>'}
        </section>` : ''}
        <p class="ea-status" role="status"></p>`;
      sheet.querySelector('[data-close]').addEventListener('click', closeSheet);
      sheet.querySelectorAll('.btn').forEach((b) => window.rollButton?.(b));
      // Switches save straight away and flip back if the server says no
      sheet.querySelectorAll('.acct-sw[data-key]').forEach((btn) => btn.addEventListener('click', async () => {
        const on = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(on)); btn.setAttribute('aria-disabled', 'true'); btn.style.pointerEvents = 'none';
        try { await momentoApi(api(a.id) + '/policy', momentoJson('PATCH', { [btn.dataset.key]: on })); say('Saved.'); await refresh(); }
        catch (err) { btn.setAttribute('aria-checked', String(!on)); btn.removeAttribute('aria-disabled'); btn.style.pointerEvents = ''; say(err.message, true); }
      }));
      sheet.querySelector('#eaDeadline')?.addEventListener('change', async (e) => {
        const v = e.target.value;
        try { await momentoApi(api(a.id) + '/policy', momentoJson('PATCH', { joinDeadline: v ? new Date(v).toISOString() : null })); say(v ? 'Deadline saved.' : 'Deadline cleared: joining closes when the event ends.'); await refresh(); }
        catch (err) { say(err.message, true); }
      });
      sheet.querySelectorAll('[data-approve]').forEach((btn) => btn.addEventListener('click', async () => {
        const row = btn.closest('li'), approve = btn.dataset.approve === '1';
        row.querySelectorAll('button').forEach((b) => { b.disabled = true; });
        try { await momentoApi(api(a.id) + '/requests/' + encodeURIComponent(row.dataset.guest), momentoJson('POST', { approve })); say(approve ? 'Let in. They’re now a guest.' : 'Declined. They won’t see the album.'); await refresh(); }
        catch (err) { row.querySelectorAll('button').forEach((b) => { b.disabled = false; }); say(err.message, true); }
      }));
    }

    // ---- Event chat: the same as a friend group's chat (groups.html) ----
    // Messages load when the chat shows, then every 3 seconds while it's open and the page is visible.
    // The server checks membership and that the host has the chat on, on every read and send.
    const chats = new Map();   // album id -> { messages, more }
    let unreadOf = new Map();  // album id -> unread count
    const timeOf = (at) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 45% 84%)`; };
    const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
    const avatar = (who, name) => `<span class="ea-av" style="--c: ${hue(name)}" aria-hidden="true">${who.avatarUrl ? `<img src="${esc(who.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : esc(initials(name))}</span>`;
    const chatOpen = new Set();          // album ids whose chat row is open (kept when the cards are redrawn)
    MQ.eventChatOpen = chatOpen;         // the notifications skip these (assets/extras.js)
    const chatBox = (a) => `
            <details class="ea-chatbox"${chatOpen.has(a.id) ? ' open' : ''}>
              <summary>Event chat<span class="ea-unread" hidden></span> ${ICON.chev}</summary>
              <p class="ea-notify" hidden><span>Get a notification when someone writes, even when Momento isn’t open.</span><button class="ea-mini" type="button" data-notify>Turn on</button></p>
              <div class="ea-msgs" role="log" aria-live="polite" aria-label="Messages in ${esc(a.name)}"></div>
              <div class="ea-typing" aria-live="polite" hidden></div>
              <form class="ea-say">
                <label class="ea-say-label" for="eaSay-${esc(a.id)}">Message everyone at ${esc(a.name)}</label>
                <textarea id="eaSay-${esc(a.id)}" name="text" rows="1" maxlength="1000" placeholder="Message everyone at the event" required></textarea>
                <button class="btn btn-dark" type="submit">Send</button>
              </form>
            </details>`;
    function setUpChat(a, box) {
      const list = box.querySelector('.ea-msgs'), form = box.querySelector('form'), field = form.elements.text;
      const typingEl = box.querySelector('.ea-typing');
      const tell = (title, text) => MQ.toast?.(title, text);
      const state = chats.get(a.id) || { messages: [], more: false, draft: '' };
      chats.set(a.id, state);
      const url = api(a.id) + '/chat';
      const shown = new Set();   // message ids already drawn, so only new ones slide in
      const draw = (stick) => {
        const near = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
        list.innerHTML = (state.more ? '<button class="ea-mini ea-older" type="button">Show earlier messages</button>' : '')
          + state.messages.map((m) => {
            const fresh = shown.size && !shown.has(m.id) && !still;
            return `<div class="ea-row${m.you ? ' is-you' : ''}${fresh ? ' is-new' : ''}">${m.you ? '' : avatar(m, m.by)}<div class="ea-msg${m.you ? ' is-you' : ''}">${m.you ? '' : `<b>${esc(m.by)}</b>`}<p>${esc(m.text)}</p><small>${esc(timeOf(m.at))}</small></div></div>`;
          }).join('');
        state.messages.forEach((m) => shown.add(m.id));
        if (!shown.size) shown.add('');
        list.querySelector('.ea-older')?.addEventListener('click', older);
        if (stick || near) list.scrollTop = list.scrollHeight;
        // Tell the notifications on every page this chat has been read
        const last = state.messages.at(-1);
        if (last) MQ.eventChatSeen?.(a.id, last.id);
      };
      // Offer phone/computer notifications once, if they've never been asked (as in friend groups)
      const notifyEl = box.querySelector('.ea-notify');
      const offerNotify = async () => {
        notifyEl.hidden = !(MQ.permission && (await MQ.permission.state('notifications')) === 'prompt');
      };
      notifyEl.querySelector('[data-notify]').addEventListener('click', async (e) => {
        if (await MQ.permission.request('notifications', { from: e.currentTarget })) MQ.toast?.('Notifications are on', `You’ll hear when someone writes in ${a.name}.`);
        offerNotify();
      });

      // "Maya is typing…" (or "Maya and Sam are typing…")
      let typingKey = '';
      const drawTyping = (people = []) => {
        const key = people.map((p) => p.name).join('|');
        if (key === typingKey) return;
        typingKey = key;
        if (!people.length) { typingEl.hidden = true; typingEl.replaceChildren(); return; }
        const names = people.map((p) => p.name);
        const text = names.length === 1 ? `${names[0]} is typing…` : names.length === 2 ? `${names[0]} and ${names[1]} are typing…` : 'Several people are typing…';
        typingEl.innerHTML = `${avatar(people[0], people[0].name)}<span class="ea-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(text)}</span>`;
        typingEl.hidden = false;
      };
      async function fetchNew(first) {
        try {
          const r = await momentoApi(url);
          if (!box.isConnected) return;
          const before = state.messages.at(-1)?.id;
          // Keep earlier pages already loaded; replace the newest 50
          const ids = new Set(r.messages.map((m) => m.id));
          const keep = state.messages.filter((m) => !ids.has(m.id) && (!r.messages[0] || m.at < r.messages[0].at));
          state.messages = [...keep, ...r.messages];
          if (first) state.more = r.more;
          if (first || state.messages.at(-1)?.id !== before) draw(first);
          drawTyping(r.typing);
          if (first) { if (unreadOf.get(a.id)) { unreadOf.delete(a.id); paintUnread(); } MQ.eventChatPoll?.(); }
        } catch (err) {
          // Chat switched off, or no longer in the album: stop asking, and say so
          if (err.status === 403 || err.status === 404) { stop(); tell('Event chat', err.message); form.querySelector('button').disabled = true; field.disabled = true; }
        }
      }
      async function older() {
        const first = state.messages[0];
        if (!first) return;
        try {
          const r = await momentoApi(`${url}?before=${encodeURIComponent(first.at)}`);
          state.messages = [...r.messages, ...state.messages];
          state.more = r.more;
          const h = list.scrollHeight;
          draw(false);
          list.scrollTop += list.scrollHeight - h;
        } catch (err) { tell('Couldn’t load earlier messages', err.message); }
      }
      let timer = 0;
      const stop = () => { clearInterval(timer); timer = 0; };
      const start = () => {
        stop();
        fetchNew(true);
        timer = setInterval(() => { if (!box.isConnected) stop(); else if (!document.hidden && box.open) fetchNew(false); }, 3000);
      };
      box.addEventListener('toggle', () => {
        if (box.open) { chatOpen.add(a.id); draw(true); start(); offerNotify(); field.focus({ preventScroll: true }); }
        else { chatOpen.delete(a.id); stop(); drawTyping([]); }
        paintUnread();
      });
      // A redrawn card picks up where it was: open, with what you were writing
      field.value = state.draft || '';
      if (box.open) { draw(true); start(); offerNotify(); }
      // Enter sends; Shift+Enter makes a new line. The box grows with the text
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
      let typedAt = 0;
      const ping = (on) => momentoApi(api(a.id) + '/typing', momentoJson('POST', on ? {} : { typing: false })).catch(() => {});
      field.addEventListener('input', () => {
        state.draft = field.value;
        field.style.height = 'auto'; field.style.height = Math.min(field.scrollHeight, 128) + 'px';
        const now = Date.now();
        if (field.value.trim() && now - typedAt > 3000) { typedAt = now; ping(true); }
        if (!field.value.trim() && typedAt) { typedAt = 0; ping(false); }
      });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = field.value.trim();
        if (!text) return;
        const btn = form.querySelector('button');
        btn.disabled = true;
        try {
          const { message } = await momentoApi(url, momentoJson('POST', { text }));
          state.messages.push(message);
          typedAt = 0;
          field.value = ''; field.style.height = ''; state.draft = '';
          draw(true);
        } catch (err) { tell('Couldn’t send the message', err.message); }
        finally { btn.disabled = false; field.focus({ preventScroll: true }); }
      });
    }
    // Unread chat messages, as a count on each album's "Event chat" row
    function paintUnread() {
      document.querySelectorAll('.ea-chatbox').forEach((box) => {
        const n = box.open ? 0 : unreadOf.get(box.closest('.ea')?.dataset.id) || 0;
        const badge = box.querySelector('.ea-unread');
        badge.hidden = !n;
        badge.textContent = n > 99 ? '99+' : String(n);
        if (n) badge.setAttribute('aria-label', `${n} unread`); else badge.removeAttribute('aria-label');
      });
    }
    async function loadUnread() {
      try {
        const { albums = [] } = await momentoApi('/api/events/unread');
        unreadOf = new Map(albums.map((x) => [x.id, x.unread]));
        for (const id of chatOpen) unreadOf.delete(id);
        paintUnread();
      } catch {}
    }
    setInterval(() => { if (!document.hidden) loadUnread(); }, 20000);
    async function refresh() {
      await loadJoined();
      if (sheetDialog.open && sheetId) {
        const scroll = sheet.scrollTop, focusKey = document.activeElement?.dataset?.key;
        const status = sheet.querySelector('.ea-status');
        const note = [status?.textContent, status?.classList.contains('error')];
        renderSheet();
        say(...note);
        sheet.scrollTop = scroll;
        if (focusKey) sheet.querySelector(`[data-key="${focusKey}"]`)?.focus();
      }
    }

    document.getElementById('refreshEvents').onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      try { await loadJoined(); } finally { button.disabled = false; }
    };
    async function loadJoined() {
      try {
        const { albums, invites = [] } = await momentoApi('/api/albums');
        // Hosts who invited you by email: join right here with their album's code
        const inviteBox = document.getElementById('eaInvites');
        inviteBox.hidden = !invites.length;
        inviteBox.querySelector('ul').innerHTML = invites.map((inv) => `<li class="ea-req glass"><b>${esc(inv.name)}</b><span>${esc([inv.by && 'from ' + inv.by, inv.date && day(inv.date)].filter(Boolean).join(' · '))}</span><button class="ea-mini dark" type="button" data-code="${esc(inv.code)}">Join</button></li>`).join('');
        inviteBox.querySelectorAll('[data-code]').forEach((b) => b.addEventListener('click', () => submitInvite(b.dataset.code)));
        // Friend-group albums are event albums too: they show here, and the group's people keep using
        // the group's one chat (the card links to it)
        const events = albums
          .sort((x, y) => ((ORDER[x.status] ?? 3) - (ORDER[y.status] ?? 3)) || String(y.date).localeCompare(String(x.date)));
        byId = new Map(events.map((a) => [a.id, a]));
        visible.clear();
        onScreen?.disconnect();
        total.textContent = events.length ? String(events.length) : '';
        if (!events.length) {
          joined.innerHTML = `<div class="ea-empty panel"><b>No event albums yet</b><p>Join with the code on your invitation, or open a public event near you below.</p><button class="btn btn-dark" type="button">Join with a code</button></div>`;
          const b = joined.querySelector('button');
          b.addEventListener('click', () => openJoin());
          window.rollButton?.(b);
        } else { joined.replaceChildren(...events.map((a, i) => card(a, i === 0 && events.length % 2 === 1))); void loadUnread(); }
        const section = document.getElementById('admission-status');
        const { requests = [] } = await momentoApi('/api/events/requests').catch(() => ({}));
        section.hidden = requests.length === 0;
        section.querySelector('ul').innerHTML = requests.map((r) => `<li class="ea-req glass${r.status === 'declined' ? ' is-declined' : ''}"><i aria-hidden="true"></i><b>${esc(r.name)}</b><span>${r.status === 'declined' ? 'The host declined' : 'Waiting for the host'}</span></li>`).join('');
      } catch (err) { joined.innerHTML = `<p class="ea-loading">${esc(err.message)}</p>`; }
    }
    document.addEventListener('DOMContentLoaded', async () => {
      const code = new URLSearchParams(location.search).get('join');
      if (code) {
        try { localStorage.setItem('momento-pending-join', JSON.stringify({ code, at: Date.now() })); } catch {}
      }
      try {
        const user = await Momento.sessionReady;
        if (!user?.emailVerified) return;
        me = user.name || '';
      } catch (err) { joined.textContent = err.message; return; }
      const loaded = loadJoined();
      if (code) {
        try { localStorage.removeItem('momento-pending-join'); } catch {}
        submitInvite(code);
      } else joinFromHash();
      document.addEventListener('momento:albums', loadJoined);
      // From a chat notification on another page: events.html#chat=<album id>
      await loaded;
      chatFromHash();
      addEventListener('hashchange', chatFromHash);
    });
    // A chat notification's "Open chat": the album's chat, right here
    function openEventChat(id) {
      const box = document.querySelector(`.ea[data-id="${CSS.escape(id)}"] .ea-chatbox`);
      if (!box) { openAlbumHere(id); return; }
      if (!box.open) box.open = true;
      box.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      // Arriving from another page, the page's own start-up can take focus; put it back in the message box
      setTimeout(() => { if (box.isConnected && box.open) box.querySelector('textarea')?.focus({ preventScroll: true }); }, 700);
    }
    MQ.openEventChat = openEventChat;
    function chatFromHash() {
      const m = location.hash.match(/^#chat=(.+)$/);
      if (!m) return;
      history.replaceState(null, '', location.pathname + location.search);
      openEventChat(decodeURIComponent(m[1]));
    }
})();
