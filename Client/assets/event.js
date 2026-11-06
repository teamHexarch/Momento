// Events: when and where an album's event is, and adding photos at it. Shared by every page.
// - Momento.event.mount(form)   adds start/end times, "uploads open before", the venue (Google Maps)
//                               and the 1 km / 2 km zone to the Create album form
// - Momento.event.read(form)    { error, focus } or { fields } to send with the new album
// - Momento.event.camera()      Momento's own camera; resolves to the photos taken (File[]). They
//                               go straight to the upload and are never saved to the device
// - Momento.event.confirmUpload(album, files)  asks before uploading (and, for guests of an album
//                               with a zone, gets their location); resolves to { location } or null
// Uses the .mq-dlg / .mq-btn / .mq-x styles from assets/qr.js, which every page loads too.
(() => {
  const Momento = (window.Momento = window.Momento || {});
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const svgIcon = (inner, size = 20) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = {
    close: svgIcon('<path d="M6 6l12 12M18 6L6 18"/>'),
    pin: svgIcon('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>', 16),
    locate: svgIcon('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', 16),
    flip: svgIcon('<path d="M4 7h11a5 5 0 0 1 0 10H9M7 4 4 7l3 3M17 20l3-3-3-3"/>', 18),
    camera: svgIcon('<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/>', 22),
  };
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (d) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const fmtWhen = (d) => d.toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  const km = (m) => `${+(m / 1000).toFixed(1)} km`;
  function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const css = document.createElement('style');
  css.textContent = `
    .ev { display: grid; gap: .9rem; margin: .2rem 0 .4rem; }
    .ev .m-row2 { margin: 0; }
    .ev-sec { display: grid; gap: .45rem; }
    .ev-label { font-size: .82rem; font-weight: 650; color: var(--slate, #5c596b); }
    .ev-hint { margin: 0; font-size: .82rem; line-height: 1.5; color: var(--slate, #5c596b); }
    .ev-lead { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-size: .9rem; }
    .ev-lead select { min-height: 2.6rem; padding: 0 .6rem; border: 1px solid var(--line, #d6d2de); border-radius: 12px; background: var(--surface, #fff); color: inherit; font: inherit; }
    .ev-lead select:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }
    .ev-range-head { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
    .ev-range-val { font-size: 1.05rem; font-weight: 750; letter-spacing: -.02em; color: var(--dusk, #2e2c3a); font-variant-numeric: tabular-nums; }
    .ev-range { --fill: 0%; width: 100%; height: 2rem; margin: 0; background: none; cursor: pointer; -webkit-appearance: none; appearance: none; }
    .ev-range::-webkit-slider-runnable-track { height: .45rem; border-radius: 100px; background: linear-gradient(to right, var(--tide, #6f9896) var(--fill), rgba(127, 120, 150, .22) var(--fill)); }
    .ev-range::-moz-range-track { height: .45rem; border-radius: 100px; background: rgba(127, 120, 150, .22); }
    .ev-range::-moz-range-progress { height: .45rem; border-radius: 100px; background: var(--tide, #6f9896); }
    .ev-range::-webkit-slider-thumb { -webkit-appearance: none; width: 1.5rem; height: 1.5rem; margin-top: -.53rem; border: 3px solid var(--surface, #fff); border-radius: 50%; background: var(--dusk, #2e2c3a); box-shadow: 0 2px 8px -2px rgba(46, 44, 58, .5); transition: transform .25s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-range::-moz-range-thumb { width: 1.2rem; height: 1.2rem; border: 3px solid var(--surface, #fff); border-radius: 50%; background: var(--dusk, #2e2c3a); box-shadow: 0 2px 8px -2px rgba(46, 44, 58, .5); }
    .ev-range:hover::-webkit-slider-thumb { transform: scale(1.1); }
    .ev-range:active::-webkit-slider-thumb { transform: scale(.95); }
    .ev-range:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 4px; border-radius: 8px; }
    .ev-range-ends { display: flex; justify-content: space-between; margin-top: -.2rem; font-size: .76rem; color: var(--slate, #5c596b); }
    .ev-venue-search gmp-place-autocomplete, .ev-venue-search input { width: 100%; box-sizing: border-box; }
    .ev-venue-search input { min-height: 2.9rem; padding: 0 .9rem; border: 1px solid var(--line, #d6d2de); border-radius: 14px; background: var(--surface, #fff); color: inherit; font: inherit; }
    .ev-map { height: 13rem; border-radius: 18px; overflow: hidden; background: rgba(127, 120, 150, .12); box-shadow: inset 0 0 0 1px rgba(46, 44, 58, .08); }
    .ev-map[hidden] { display: none; }
    .ev-venue-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem; }
    .ev-picked { display: flex; gap: .4rem; align-items: flex-start; margin: 0; font-size: .86rem; line-height: 1.45; color: var(--dusk, #2e2c3a); }
    .ev-picked svg { flex: none; margin-top: .1rem; }
    .ev-picked.is-empty { color: var(--slate, #5c596b); }
    .ev-link { display: inline-flex; align-items: center; gap: .35rem; padding: .4rem .75rem; border: none; border-radius: 100px; background: rgba(127, 120, 150, .14); color: var(--dusk, #2e2c3a); font: inherit; font-size: .85rem; font-weight: 650; cursor: pointer; transition: background-color .2s ease, transform .3s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    .ev-link:hover { background: rgba(127, 120, 150, .24); }
    .ev-link:active { transform: scale(.96); }
    .ev-link:focus-visible { outline: 2px solid var(--dusk, #2e2c3a); outline-offset: 2px; }

    /* Momento's camera */
    .ev-cam { background: #0b0a10; color: #fff; }
    .ev-cam video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .ev-cam.is-front video { transform: scaleX(-1); }
    .ev-cam .mq-x { background: rgba(255, 255, 255, .14); color: #fff; backdrop-filter: blur(10px); }
    .ev-cam-top { position: absolute; top: max(1rem, env(safe-area-inset-top)); left: 16px; right: 4.5rem; z-index: 2; }
    .ev-cam-top h2 { margin: .35rem 0 0; font-size: 1.25rem; font-weight: 750; letter-spacing: -.03em; }
    .ev-cam-top p { margin: .25rem 0 0; color: rgba(255, 255, 255, .78); font-size: .88rem; line-height: 1.45; }
    .ev-cam-top p.is-error { color: #ffb4a8; }
    .ev-cam-bar { position: absolute; left: 0; right: 0; bottom: 0; z-index: 2; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 1rem; padding: 1.2rem 16px max(1.4rem, env(safe-area-inset-bottom)); background: linear-gradient(to top, rgba(8, 7, 12, .85), rgba(8, 7, 12, 0)); }
    .ev-shutter { width: 4.6rem; height: 4.6rem; border: 4px solid #fff; border-radius: 50%; background: rgba(255, 255, 255, .25); cursor: pointer; transition: transform .25s var(--spring, cubic-bezier(.34, 1.4, .64, 1)), background-color .2s ease; }
    .ev-shutter:hover { background: rgba(255, 255, 255, .4); }
    .ev-shutter:active { transform: scale(.88); }
    .ev-shutter:focus-visible { outline: 3px solid #9fd2cd; outline-offset: 4px; }
    .ev-shutter[disabled] { opacity: .4; cursor: default; }
    .ev-shots { display: flex; align-items: center; gap: .35rem; min-width: 0; overflow: hidden; }
    .ev-shots img { width: 2.6rem; height: 2.6rem; flex: none; border-radius: 10px; object-fit: cover; box-shadow: 0 0 0 2px rgba(255, 255, 255, .7); animation: ev-pop .35s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @keyframes ev-pop { from { transform: scale(.4); opacity: 0; } }
    .ev-cam-right { display: flex; justify-content: flex-end; gap: .5rem; flex-wrap: wrap; }
    .ev-cam .mq-btn { background: rgba(255, 255, 255, .16); color: #fff; backdrop-filter: blur(12px); }
    .ev-cam .mq-btn.is-main { background: #fff; color: #17161d; }
    .ev-flash { position: absolute; inset: 0; z-index: 1; background: #fff; opacity: 0; pointer-events: none; }
    .ev-flash.is-on { animation: ev-flash .35s ease-out; }
    @keyframes ev-flash { from { opacity: .85; } to { opacity: 0; } }

    /* Asking before an upload */
    .ev-ask { position: fixed; inset: 0; margin: auto; width: min(26rem, calc(100vw - 32px)); height: fit-content; max-height: calc(100dvh - 32px); box-sizing: border-box; padding: 1.4rem; border: none; border-radius: 28px; overflow: auto;
      background: var(--surface, #fff); color: var(--dusk, #2e2c3a); font-family: var(--font-main, -apple-system, BlinkMacSystemFont, 'Inter', sans-serif);
      box-shadow: 0 0 0 1px rgba(46, 44, 58, .08), 0 30px 60px -30px rgba(46, 44, 58, .55), 0 8px 18px -10px rgba(46, 44, 58, .3); }
    .ev-ask::backdrop { background: rgba(10, 9, 14, .5); }
    .ev-ask[open] { animation: ev-in .4s var(--spring, cubic-bezier(.34, 1.4, .64, 1)); }
    @keyframes ev-in { from { opacity: 0; transform: translateY(14px) scale(.97); } }
    .ev-ask h2 { margin: 0; font-size: 1.4rem; letter-spacing: -.03em; line-height: 1.2; }
    .ev-ask p { margin: .5rem 0 0; color: var(--slate, #5c596b); line-height: 1.55; font-size: .93rem; }
    .ev-ask .ev-thumbs { display: flex; gap: .4rem; margin: 1rem 0 .2rem; overflow: hidden; }
    .ev-ask .ev-thumbs img { width: 3.6rem; height: 3.6rem; flex: none; border-radius: 12px; object-fit: cover; }
    .ev-ask .ev-thumbs span { display: grid; place-items: center; width: 3.6rem; height: 3.6rem; flex: none; border-radius: 12px; background: rgba(127, 120, 150, .14); font-weight: 700; }
    .ev-ask .ev-loc { display: flex; gap: .55rem; margin-top: .9rem; padding: .75rem .85rem; border-radius: 16px; background: rgba(111, 152, 150, .14); color: var(--dusk, #2e2c3a); font-size: .88rem; line-height: 1.5; }
    .ev-ask .ev-loc svg { flex: none; margin-top: .15rem; }
    .ev-ask .ev-err { color: #a33a2c; font-weight: 600; }
    .ev-ask .mq-row { justify-content: flex-end; margin-top: 1.2rem; }
    .ev-ask .mq-btn { background: var(--dusk, #2e2c3a); color: var(--paper, #fff); }
    .ev-ask .mq-btn.is-light { background: rgba(127, 120, 150, .14); color: var(--dusk, #2e2c3a); }
    :root[data-theme="dark"] .ev-ask .ev-err { color: #ffb4a8; }
    @media (prefers-reduced-motion: reduce) { .ev-ask[open], .ev-shots img, .ev-flash.is-on { animation: none; } }`;
  document.head.append(css);

  // ---- Where the device is (asks the browser, which asks the person the first time) ----
  function locate() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('This browser can’t share your location.'));
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
        (err) => reject(new Error(err.code === 1
          ? 'Location access is off for Momento. Allow it in your browser’s site settings, then try again.'
          : err.code === 3 ? 'Finding your location took too long. Try again, ideally near a window or outside.'
          : 'Your location couldn’t be found. Try again.')),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });
  }

  // ---- Google Maps (only when the server has a key) ----
  let configP = null, mapsP = null;
  const getConfig = () => (configP ||= (window.momentoApi ? window.momentoApi('/api/config') : Promise.resolve({})).catch(() => ({})));
  function loadMaps(key) {
    return (mapsP ||= new Promise((resolve, reject) => {
      if (window.google?.maps?.importLibrary) return resolve(window.google.maps);
      window.__momentoMapsReady = () => resolve(window.google.maps);
      window.gm_authFailure = () => { document.dispatchEvent(new Event('momento:maps-failed')); };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async&callback=__momentoMapsReady`;
      s.async = true;
      s.onerror = () => { mapsP = null; reject(new Error('Google Maps didn’t load.')); };
      document.head.append(s);
    }));
  }

  // ---- The Create album form ----
  const LEADS_H = Array.from({ length: 25 }, (_, h) => h);
  const LEADS_M = [0, 15, 30, 45];
  function mount(form) {
    const view = form.querySelector('[data-view="form"]') || form;
    let box = view.querySelector('.ev');
    const placeField = form.place?.closest('label');
    if (placeField) placeField.hidden = true;   // the venue below sets the place
    if (!box) {
      box = document.createElement('div');
      box.className = 'ev';
      box.innerHTML = `
        <div class="m-row2">
          <label class="acct-field"><span>Starts</span><input name="evStart" type="time" required></label>
          <label class="acct-field"><span>Ends</span><input name="evEnd" type="time" required></label>
        </div>
        <div class="ev-sec">
          <span class="ev-label" id="evLeadLabel">Guests can add photos from</span>
          <div class="ev-lead" role="group" aria-labelledby="evLeadLabel">
            <select name="evLeadH" aria-label="Hours before the start">${LEADS_H.map((h) => `<option value="${h}">${h} h</option>`).join('')}</select>
            <select name="evLeadM" aria-label="Minutes before the start">${LEADS_M.map((m) => `<option value="${m}">${m} min</option>`).join('')}</select>
            <span>before it starts</span>
          </div>
          <p class="ev-hint" data-lead-hint></p>
        </div>
        <div class="ev-sec">
          <span class="ev-label">Venue</span>
          <div class="ev-venue-search"></div>
          <div class="ev-map" hidden></div>
          <div class="ev-venue-row">
            <p class="ev-picked is-empty" data-picked>${ICON.pin}<span>No venue chosen yet</span></p>
            <button class="ev-link" type="button" data-here>${ICON.locate}Use where I am</button>
          </div>
        </div>
        <div class="ev-sec">
          <div class="ev-range-head"><label class="ev-label" for="evRadius">Guests can add photos within</label><output class="ev-range-val" for="evRadius" data-radius-out>1 km</output></div>
          <input class="ev-range" id="evRadius" name="evRadius" type="range" min="1" max="10" step="0.5" value="1" aria-valuetext="1 kilometre">
          <div class="ev-range-ends" aria-hidden="true"><span>1 km</span><span>10 km</span></div>
          <p class="ev-hint">of the venue. Momento checks a guest’s location when they upload.</p>
        </div>`;
      view.querySelector('.acct-status')?.before(box);
      wire(form, box);
    }
    box._reset();
  }

  function wire(form, box) {
    const state = { venue: null, radiusM: 1000, map: null, marker: null, circle: null };
    box._state = state;
    const picked = box.querySelector('[data-picked]'), mapEl = box.querySelector('.ev-map'), search = box.querySelector('.ev-venue-search');
    const leadHint = box.querySelector('[data-lead-hint]');

    const showPicked = () => {
      picked.classList.toggle('is-empty', !state.venue);
      picked.lastChild.textContent = state.venue ? [state.venue.name, state.venue.address].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') : 'No venue chosen yet';
    };
    const drawZone = () => {
      if (!state.map || !state.venue) return;
      const pos = { lat: state.venue.lat, lng: state.venue.lng };
      if (state.marker) state.marker.position = pos;
      if (state.circle) { state.circle.setCenter(pos); state.circle.setRadius(state.radiusM); state.map.fitBounds(state.circle.getBounds(), 8); }
    };
    const setVenue = (v) => {
      state.venue = v;
      if (form.place) form.place.value = (v?.name || v?.address || '').slice(0, 60);
      showPicked(); drawZone();
    };

    // Uploads-open hint, e.g. "Uploads open at 6:30 pm, close at 11:00 pm"
    const syncLead = () => {
      const t = times(form);
      leadHint.textContent = t ? `Uploads open ${fmtWhen(new Date(t.startsAt.getTime() - t.leadMin * 60000))} and close ${fmtTime(t.endsAt)}${t.endsAt.getDate() !== t.startsAt.getDate() ? ' the next day' : ''}.` : '';
    };
    ['evStart', 'evEnd', 'evLeadH', 'evLeadM', 'date'].forEach((n) => form[n]?.addEventListener('input', syncLead));
    ['evLeadH', 'evLeadM'].forEach((n) => form[n].addEventListener('change', syncLead));

    // The zone: 1 to 10 km in half-kilometre steps; the circle on the map follows the slider
    const range = form.evRadius, rangeOut = box.querySelector('[data-radius-out]');
    const syncRadius = () => {
      const k = Number(range.value);
      state.radiusM = Math.round(k * 1000);
      rangeOut.textContent = `${k} km`;
      range.setAttribute('aria-valuetext', `${k} kilometre${k === 1 ? '' : 's'}`);
      range.style.setProperty('--fill', `${((k - 1) / 9) * 100}%`);
      drawZone();
    };
    range.addEventListener('input', syncRadius);
    box._syncRadius = syncRadius;

    const here = box.querySelector('[data-here]');
    here.addEventListener('click', async () => {
      const label = here.lastChild.textContent;
      here.lastChild.textContent = 'Finding you…';
      try {
        const p = await locate();
        const typed = search.querySelector('input')?.value.trim();
        setVenue({ lat: p.lat, lng: p.lng, name: typed || 'Where you are now', address: '', placeId: '' });
        if (state.map) state.map.setCenter(p);
      } catch (err) { picked.classList.add('is-empty'); picked.lastChild.textContent = err.message; }
      finally { here.lastChild.textContent = label; }
    });

    // Without Google Maps: a name for the venue, located with "Use where I am"
    const plain = (why) => {
      search.innerHTML = `<input type="text" maxlength="60" placeholder="Venue name, e.g. The Grand Hall" aria-label="Venue name" autocomplete="off">`;
      const input = search.querySelector('input');
      input.addEventListener('input', () => {
        if (form.place) form.place.value = input.value.trim();
        if (state.venue) { state.venue.name = input.value.trim(); showPicked(); }
      });
      mapEl.hidden = true;
      if (why) box.querySelector('.ev-venue-row').insertAdjacentHTML('afterend', `<p class="ev-hint">${esc(why)}</p>`);
    };

    box._reset = () => {
      form.evStart.value = '19:00'; form.evEnd.value = '23:00';
      form.evLeadH.value = '0'; form.evLeadM.value = '30';
      form.evRadius.value = '1';
      box._syncRadius();
      setVenue(null);
      const input = search.querySelector('input'); if (input) input.value = '';
      syncLead();
    };

    // Google Maps: search for the venue, then fine-tune by dragging the pin or tapping the map
    getConfig().then(async ({ mapsApiKey }) => {
      if (!mapsApiKey) return plain('Type the venue’s name, then use “Use where I am” while you’re there, or ask for the Google Maps key to be added so you can search for it.');
      try {
        await loadMaps(mapsApiKey);
        const [{ Map, Circle }, { PlaceAutocompleteElement }, { AdvancedMarkerElement }] = await Promise.all(
          ['maps', 'places', 'marker'].map((l) => google.maps.importLibrary(l)));
        const ac = new PlaceAutocompleteElement({});
        ac.setAttribute('placeholder', 'Search for the venue');
        search.append(ac);
        const usePlace = async (place) => {
          if (!place) return;
          await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location', 'id'] });
          if (!place.location) return;
          setVenue({ lat: place.location.lat(), lng: place.location.lng(), name: place.displayName || '', address: place.formattedAddress || '', placeId: place.id || '' });
        };
        ac.addEventListener('gmp-select', (e) => usePlace(e.placePrediction?.toPlace()));
        ac.addEventListener('gmp-placeselect', (e) => usePlace(e.place));   // older versions of the element
        mapEl.hidden = false;
        const start = state.venue || { lat: -33.8688, lng: 151.2093 };
        state.map = new Map(mapEl, { center: start, zoom: 13, mapId: 'DEMO_MAP_ID', disableDefaultUI: true, zoomControl: true, gestureHandling: 'cooperative', clickableIcons: false });
        state.marker = new AdvancedMarkerElement({ map: state.map, position: start, gmpDraggable: true, title: 'Venue' });
        state.circle = new Circle({ map: state.map, center: start, radius: state.radiusM, strokeColor: '#6F9896', strokeOpacity: .9, strokeWeight: 2, fillColor: '#6F9896', fillOpacity: .14, clickable: false });
        const moved = (ll) => setVenue({ ...(state.venue || {}), lat: ll.lat, lng: ll.lng, name: state.venue?.name || 'Pinned on the map', address: state.venue?.address || '', placeId: '' });
        state.marker.addListener('dragend', () => { const p = state.marker.position; moved({ lat: typeof p.lat === 'function' ? p.lat() : p.lat, lng: typeof p.lng === 'function' ? p.lng() : p.lng }); });
        state.map.addListener('click', (e) => moved({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        if (!state.venue && navigator.permissions) {
          // Centre the map on the host if they've already allowed location (no new prompt here)
          navigator.permissions.query({ name: 'geolocation' }).then((p) => { if (p.state === 'granted') locate().then((l) => { if (!state.venue) state.map.setCenter(l); }, () => {}); }, () => {});
        }
        drawZone();
        document.addEventListener('momento:maps-failed', () => { search.innerHTML = ''; plain('Google Maps couldn’t be used (check the API key). Type the venue’s name and use “Use where I am” instead.'); }, { once: true });
      } catch (err) {
        search.innerHTML = '';
        plain('Google Maps couldn’t load, so type the venue’s name and use “Use where I am” instead.');
      }
    });
  }

  // The event's times from the form, or null
  function times(form) {
    const date = form.date?.value, s = form.evStart?.value, e = form.evEnd?.value;
    if (!date || !s || !e) return null;
    const startsAt = new Date(`${date}T${s}`);
    let endsAt = new Date(`${date}T${e}`);
    if (endsAt <= startsAt) endsAt = new Date(endsAt.getTime() + 86400000);   // runs past midnight
    const leadMin = Number(form.evLeadH?.value || 0) * 60 + Number(form.evLeadM?.value || 0);
    return { startsAt, endsAt, leadMin };
  }

  function read(form) {
    const box = form.querySelector('.ev');
    if (!box) return { fields: {} };
    const st = box._state, t = times(form);
    if (!form.evStart.value) return { error: 'Pick the time the event starts.', focus: form.evStart };
    if (!form.evEnd.value) return { error: 'Pick the time the event ends.', focus: form.evEnd };
    if (!t) return { error: 'Pick the date of the event.', focus: form.date };
    if (t.endsAt < new Date()) return { error: 'That event has already finished. Check the date and times.', focus: form.evEnd };
    if (t.leadMin > 1440) return { error: 'Uploads can open up to 24 hours before the event.', focus: form.evLeadH };
    if (!st.venue) return { error: 'Choose the venue: search for it, tap the map, or use where you are.', focus: box.querySelector('gmp-place-autocomplete, .ev-venue-search input, [data-here]') };
    const name = (box.querySelector('.ev-venue-search input')?.value || st.venue.name || '').trim();
    return {
      fields: {
        place: name.slice(0, 60),
        startsAt: t.startsAt.toISOString(),
        endsAt: t.endsAt.toISOString(),
        uploadLeadMin: t.leadMin,
        zone: { lat: st.venue.lat, lng: st.venue.lng, radiusM: st.radiusM },
        venue: { address: st.venue.address || '', placeId: st.venue.placeId || '' },
      },
    };
  }

  // ---- Momento's camera: photos go into the upload, never into the device's gallery ----
  function camera() {
    return new Promise((resolve) => {
      const d = document.createElement('dialog');
      d.className = 'mq-dlg ev-cam';
      d.innerHTML = `
        <video playsinline muted autoplay></video>
        <span class="ev-flash" aria-hidden="true"></span>
        <div class="ev-cam-top"><h2>Take a photo</h2><p role="status" aria-live="polite">Starting the camera…</p></div>
        <button class="mq-x" type="button" aria-label="Close the camera" data-close>${ICON.close}</button>
        <div class="ev-cam-bar">
          <div class="ev-shots" aria-live="polite"></div>
          <button class="ev-shutter" type="button" aria-label="Take photo" disabled></button>
          <div class="ev-cam-right">
            <button class="mq-btn" type="button" data-flip hidden aria-label="Switch camera">${ICON.flip}</button>
            <button class="mq-btn is-main" type="button" data-use hidden>Use photos</button>
          </div>
        </div>`;
      document.body.append(d);
      const video = d.querySelector('video'), status = d.querySelector('.ev-cam-top p'), shutter = d.querySelector('.ev-shutter');
      const shotsEl = d.querySelector('.ev-shots'), use = d.querySelector('[data-use]'), flip = d.querySelector('[data-flip]');
      const shots = [], urls = [];
      let stream = null, facing = 'environment', settled = false;
      const say = (m, bad) => { status.textContent = m; status.classList.toggle('is-error', !!bad); };
      const stop = () => { stream?.getTracks().forEach((t) => t.stop()); stream = null; video.srcObject = null; };
      const finish = (files) => {
        if (settled) return; settled = true;
        stop(); urls.forEach(URL.revokeObjectURL);
        if (d.open) d.close();
        d.remove();
        resolve(files);
      };
      async function start() {
        stop(); shutter.disabled = true;
        say('Starting the camera…');
        try {
          if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error(), { name: 'Insecure' });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
          if (settled) return stop();
          video.srcObject = stream;
          await video.play().catch(() => {});
          const s = stream.getVideoTracks()[0]?.getSettings?.() || {};
          d.classList.toggle('is-front', (s.facingMode || facing) === 'user');
          shutter.disabled = false;
          say(shots.length ? `${shots.length} taken. Take more, or use them.` : 'Photos taken here go straight to the album, not to your gallery.');
          const cams = (await navigator.mediaDevices.enumerateDevices()).filter((x) => x.kind === 'videoinput');
          flip.hidden = cams.length < 2;
        } catch (err) {
          say(err.name === 'NotAllowedError' ? 'Camera access is off for Momento. Allow it in your browser’s site settings, then reopen the camera.'
            : err.name === 'NotFoundError' ? 'No camera was found on this device.'
            : err.name === 'Insecure' ? 'The camera only works when Momento is opened over https.'
            : 'The camera didn’t start. Close other apps using it and try again.', true);
        }
      }
      shutter.addEventListener('click', () => {
        const w = video.videoWidth, h = video.videoHeight;
        if (!w || !h || shots.length >= 30) return;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(video, 0, 0, w, h);
        d.querySelector('.ev-flash').classList.remove('is-on'); void d.offsetWidth; d.querySelector('.ev-flash').classList.add('is-on');
        navigator.vibrate?.(20);
        c.toBlob((blob) => {
          if (!blob) return;
          const file = new File([blob], `momento-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
          shots.push(file);
          const url = URL.createObjectURL(blob); urls.push(url);
          const img = new Image(); img.src = url; img.alt = '';
          shotsEl.append(img);
          while (shotsEl.children.length > 4) shotsEl.firstChild.remove();
          use.hidden = false;
          use.textContent = shots.length === 1 ? 'Use photo' : `Use ${shots.length} photos`;
          say(`${shots.length} taken. Take more, or use ${shots.length === 1 ? 'it' : 'them'}.`);
        }, 'image/jpeg', .92);
      });
      flip.addEventListener('click', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); });
      use.addEventListener('click', () => finish(shots.slice()));
      d.querySelector('[data-close]').addEventListener('click', () => finish([]));
      d.addEventListener('cancel', (e) => { e.preventDefault(); finish([]); });
      d.showModal();
      start();
    });
  }

  // ---- Asking before an upload (and the guest's location, when the album has a zone) ----
  function confirmUpload(album, files) {
    return new Promise((resolve) => {
      const needsPlace = album?.role !== 'host' && album?.startsAt && album?.zone?.radiusM;
      const n = files.length, what = n === 1 ? 'this photo' : `these ${n} photos`;
      const d = document.createElement('dialog');
      d.className = 'ev-ask';
      d.setAttribute('aria-labelledby', 'evAskTitle');
      const urls = files.slice(0, 5).map((f) => URL.createObjectURL(f));
      d.innerHTML = `
        <h2 id="evAskTitle">Upload ${n === 1 ? '1 photo' : `${n} photos`}?</h2>
        <p>Momento would like to add ${what} to <b>${esc(album?.name || 'the album')}</b>. Everyone in the album will be able to see and download ${n === 1 ? 'it' : 'them'}.</p>
        <div class="ev-thumbs">${urls.map((u) => `<img src="${u}" alt="">`).join('')}${n > 5 ? `<span>+${n - 5}</span>` : ''}</div>
        ${needsPlace ? `<div class="ev-loc">${ICON.pin}<span>To check you’re at the event, Momento will ask for your location. You need to be within ${km(album.zone.radiusM)} of the venue. Your location is only checked, not saved.</span></div>` : ''}
        <p class="ev-err" role="alert" hidden></p>
        <div class="mq-row"><button class="mq-btn is-light" type="button" data-no>Cancel</button><button class="mq-btn" type="button" data-yes autofocus>${needsPlace ? 'Allow and upload' : 'Upload'}</button></div>`;
      document.body.append(d);
      const err = d.querySelector('.ev-err'), yes = d.querySelector('[data-yes]');
      let settled = false;
      const done = (v) => { if (settled) return; settled = true; urls.forEach(URL.revokeObjectURL); if (d.open) d.close(); d.remove(); resolve(v); };
      d.querySelector('[data-no]').addEventListener('click', () => done(null));
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(null); });
      yes.addEventListener('click', async () => {
        if (!needsPlace) return done({ location: '' });
        yes.disabled = true; yes.textContent = 'Checking your location…'; err.hidden = true;
        try {
          const p = await locate();
          const away = distanceM(p, album.zone);
          if (away - Math.min(p.accuracy || 0, 200) > album.zone.radiusM) {
            throw new Error(`You’re about ${km(away)} from the venue. Photos can be added within ${km(album.zone.radiusM)} of it.`);
          }
          done({ location: `${p.lat.toFixed(6)},${p.lng.toFixed(6)},${Math.round(p.accuracy || 0)}` });
        } catch (e) {
          err.textContent = e.message; err.hidden = false;
          yes.disabled = false; yes.textContent = 'Try again';
        }
      });
      d.showModal();
    });
  }

  // When an album with event times opens for photos, in words: "Photos can be added from Sat 8 Nov, 6:30 pm"
  function windowText(a) {
    if (!a?.startsAt || !a?.endsAt) return '';
    const s = new Date(a.startsAt), e = new Date(a.endsAt), opens = new Date(a.opensAt || s);
    const when = `${fmtWhen(s)} to ${fmtTime(e)}`;
    const zone = a.zone?.radiusM ? ` within ${km(a.zone.radiusM)} of the venue` : '';
    if (a.status === 'upcoming') return `Event ${when}. Photos can be added from ${fmtWhen(opens)}${zone}.`;
    if (a.status === 'live') return `Event ${when}. Photos can be added until ${fmtTime(e)}${zone}.`;
    return `Event ${when}. This album has closed to new photos.`;
  }

  Momento.event = { mount, read, camera, confirmUpload, locate, windowText, distanceM };
})();
