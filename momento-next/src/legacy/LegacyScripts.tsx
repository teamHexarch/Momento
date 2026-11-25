'use client';

import { useEffect } from 'react';
import { preload } from 'react-dom';
import { markLegacyReady } from '@/lib/legacy';

/**
 * Runs the original Momento page scripts, unchanged and in the original order.
 *
 * On the old site these scripts ran while the page was still being read, so they could count on the
 * "DOMContentLoaded" and "load" events still being ahead of them. In a Next.js page they can only run once the
 * page has been hydrated, when both events are already behind. So, while they load, a small shim answers any
 * listener for an event that has already happened by calling it straight away (just after the script ends),
 * which is what the browser would have done a moment earlier. Everything else about the page is untouched.
 *
 * Each file stays a separate classic script (as the original inline blocks were), so one block failing
 * doesn't stop the next, and they still share one global scope.
 */
/** A script address, or one that must be checked against a published hash (the map library on the Social page) */
export type LegacyScript = string | { src: string; integrity: string; crossOrigin: 'anonymous' };

/**
 * `start`: the page's own code (src/page-scripts/<page>.js, formerly public/legacy/<page>-N.js). It runs where the first
 * of the old scripts ran: once the late-listener shim is in place (so its DOMContentLoaded and load listeners queue first,
 * in order) and before the shared asset scripts are added.
 */
export default function LegacyScripts({ scripts, start }: { scripts: LegacyScript[]; start?: () => void }) {
  // Start downloading the scripts with the page itself (a <link rel="preload"> in <head>), not once React has
  // hydrated: when the effect below adds them, they are already in the cache, so they run straight away.
  // Only the download moves earlier; when and in what order they run is unchanged.
  for (const item of scripts) {
    if (typeof item === 'string') preload(item, { as: 'script', fetchPriority: 'low' });
    else preload(item.src, { as: 'script', integrity: item.integrity, crossOrigin: item.crossOrigin, fetchPriority: 'low' });
  }

  useEffect(() => {
    const w = window as unknown as { __momentoLegacy?: boolean };
    if (w.__momentoLegacy) return; // run once per page load
    w.__momentoLegacy = true;

    // ---- shim: late listeners for events that already fired ----
    const docAdd = document.addEventListener.bind(document);
    const winAdd = window.addEventListener.bind(window);
    // The browser fires DOMContentLoaded only after every script has run, so until the last one has, late
    // listeners wait in a queue (DOMContentLoaded ones first, then load ones, each in the order they asked).
    let loading = true;
    const queue: { target: EventTarget; type: string; fn: EventListenerOrEventListenerObject }[] = [];
    const call = (target: EventTarget, type: string, fn: EventListenerOrEventListenerObject) => {
      const ev = new Event(type);
      try {
        if (typeof fn === 'function') fn.call(target, ev);
        else fn.handleEvent(ev);
      } catch (err) {
        console.error(err); // one listener failing must not stop the others
      }
    };
    const late = (target: EventTarget, type: string, fn: EventListenerOrEventListenerObject | null) => {
      if (!fn) return;
      if (loading) queue.push({ target, type, fn });
      else setTimeout(() => call(target, type, fn), 0);
    };
    const flush = () => {
      loading = false;
      for (const kind of ['DOMContentLoaded', 'load']) {
        for (const q of queue.filter((x) => x.type === kind)) call(q.target, q.type, q.fn);
      }
      queue.length = 0;
    };
    document.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) => {
      if (type === 'DOMContentLoaded' && document.readyState !== 'loading') return late(document, type, fn);
      return docAdd(type, fn as EventListener, opts);
    }) as typeof document.addEventListener;
    window.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject | null, opts?: boolean | AddEventListenerOptions) => {
      if (type === 'load' && document.readyState === 'complete') return late(window, type, fn);
      // DOMContentLoaded reaches window as well as document (Settings listens on window)
      if (type === 'DOMContentLoaded' && document.readyState !== 'loading') return late(window, type, fn);
      return winAdd(type, fn as EventListener, opts);
    }) as typeof window.addEventListener;

    // ---- the language file's start-up first (it was the first script on the original page) ----
    // It translates the page as hydrated and then keeps translating whatever the scripts add (its MutationObserver),
    // so the page can be shown in its language now, instead of staying hidden until every script below has loaded.
    {
      const englishTitle = document.title;
      (window as unknown as { __momentoI18n?: { release(): void } }).__momentoI18n?.release();
      // i18n.js translates the tab title once. Next.js refreshes its own <title> a moment later and puts the English
      // one back, so if the title was translated, keep it that way for a few seconds.
      const translatedTitle = document.title;
      if (translatedTitle !== englishTitle) {
        const keep = new MutationObserver(() => {
          if (document.title === englishTitle) document.title = translatedTitle;
        });
        keep.observe(document.head, { subtree: true, childList: true, characterData: true });
        setTimeout(() => keep.disconnect(), 10000);
      }
      document.documentElement.classList.remove('i18n-pending'); // translated: show the page
    }

    // ---- the page's own code, as on the original page ----
    if (start) { try { start(); } catch (err) { console.error(err); } }

    // ---- load the scripts: downloaded together, executed in order ----
    const restore = () => {
      flush();
      // React components that talk to the old scripts (window.Momento) start listening now: see lib/legacy.ts
      markLegacyReady();
      // keep the shim a moment longer so listeners added from inside the scripts' own timers are covered too
      setTimeout(() => {
        document.addEventListener = docAdd as typeof document.addEventListener;
        window.addEventListener = winAdd as typeof window.addEventListener;
      }, 0);
    };
    let pending = scripts.length;
    for (const item of scripts) {
      const src = typeof item === 'string' ? item : item.src;
      const s = document.createElement('script');
      s.src = src;
      if (typeof item !== 'string') { s.integrity = item.integrity; s.crossOrigin = item.crossOrigin; }
      s.async = false; // dynamically added scripts run in the order they were added only when async is false
      const done = () => { if (--pending === 0) restore(); };
      s.onload = done;
      s.onerror = () => { console.error('Momento: could not load ' + src); done(); };
      document.body.appendChild(s);
    }
    // A page with no scripts of its own (Terms, Privacy) still needs the language file's start-up released
    if (pending === 0) restore();
  }, [scripts, start]);

  return null;
}
