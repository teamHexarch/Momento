// Events near you: when a public event is live and you're inside its zone, Momento says so with a
// message on the page ("City Marathon is happening near you. See it") and, if you turned it on in
// Events and allowed it, a browser notification too. Each event is announced once.
// It never asks for your location: it only looks when you've already allowed it, and the
// "Find albums near me" setting (Settings > Location) switches it off.
// (This works while Momento is open in a tab. Alerts when it's closed need push notifications.)
(() => {
  if (document.documentElement.dataset.page === 'events') return;   // the Events page shows them itself
  const SEEN = 'momento-nearby-seen', NOTIFY = 'momento-notify-nearby', SETTINGS = 'momento-settings';
  const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? fallback; } catch (e) { return fallback; } };
  let busy = false;

  async function check() {
    if (busy || document.hidden || !window.momentoApi || !navigator.geolocation || !navigator.permissions) return;
    if (read(SETTINGS, {}).nearby === false) return;
    busy = true;
    try {
      const perm = await navigator.permissions.query({ name: 'geolocation' }).catch(() => null);
      if (perm?.state !== 'granted') return;
      const user = await window.Momento?.sessionReady?.catch?.(() => null);
      if (!user?.emailVerified) return;
      const at = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { maximumAge: 300000, timeout: 10000 }));
      if (!at) return;
      const { events = [] } = await momentoApi(`/api/events/nearby?lat=${at.lat.toFixed(5)}&lng=${at.lng.toFixed(5)}&km=15`).catch(() => ({}));
      const seen = read(SEEN, {}), now = Date.now();
      for (const id of Object.keys(seen)) if (now - seen[id] > 2 * 864e5) delete seen[id];
      const e = events.find((x) => x.live && x.inside && !x.joined && !seen[x.id]);
      if (!e) return;
      seen[e.id] = now;
      try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch (err) {}
      const go = () => { location.href = 'events.html?event=' + encodeURIComponent(e.id); };
      window.Momento?.toast?.(`${e.name} is happening near you`, 'You’re inside its zone, so you can join and add your photos.', { action: { label: 'See it', run: go } });
      if (localStorage.getItem(NOTIFY) === '1' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification(`${e.name} is happening near you`, { body: 'You’re inside its zone. Tap to see it and join.', tag: 'momento-event-' + e.id, icon: 'assets/momento-icon.png' });
          n.onclick = () => { window.focus(); go(); n.close(); };
        } catch (err) {}
      }
    } finally { busy = false; }
  }
  addEventListener('load', () => setTimeout(check, 2500));
  setInterval(check, 10 * 60000);   // and again every 10 minutes while the tab is open
})();
