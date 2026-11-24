/**
 * Page intros (Momento.intro). A page puts a veil (#intro) over itself and plays a short sequence once per tab session,
 * ending by handing off to real elements (the header logo, an album cover, a nav icon). intro(run) gives `run` a small
 * kit. A press, key, wheel or touch skips straight to the finished page. Only plays while <html> has `intro-on`
 * (set before first paint by the boot script in <head>). Unchanged from the old shared script.
 */
export type IntroKit = {
  readonly done: boolean;
  reveal(): void;
  finish(skipped?: boolean): void;
  undo(fn: () => void): void;
  play(el: Element | null, frames: Keyframe[], opts?: KeyframeAnimationOptions): Promise<void>;
  hold(el: Element | null): Promise<void>;
  wait(ms: number): Promise<void>;
  tween(ms: number, fn: (p: number) => void): Promise<void>;
  flip(el: Element, to: DOMRect): string;
};

export function intro(run: (kit: IntroKit) => unknown) {
  const root = document.documentElement;
  const veil = document.getElementById('intro');
  if (!root.classList.contains('intro-on')) { if (veil) veil.remove(); return; }
  root.classList.add('intro-run'); // it has started: the boot script's early safety release stands down (headScripts.ts)
  const anims: Animation[] = [], undo: (() => void)[] = [];
  let done = false, revealed = false;
  // The moment the page's own entrance (groups rising in, headings) may begin
  const reveal = () => { if (!revealed) { revealed = true; document.dispatchEvent(new Event('momento:intro-reveal')); } };
  const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  const skip = () => finish(true);
  function finish(skipped?: boolean) {
    if (done) return;
    done = true;
    EVENTS.forEach((t) => removeEventListener(t, skip, true));
    root.classList.remove('intro-on');
    anims.forEach((a) => a.cancel());
    undo.forEach((fn) => fn());
    try { sessionStorage.setItem('momento-intro-' + root.dataset.page, '1'); } catch {}
    reveal();
    document.dispatchEvent(new Event('momento:intro-end'));
    if (!veil) return;
    if (!skipped) { veil.remove(); return; }
    // Skipped: the veil keeps catching the press for a moment, then fades off the finished page
    veil.style.display = 'block';
    veil.animate({ opacity: [1, 0] }, { duration: 260, easing: 'ease-out' }).finished.then(() => veil.remove(), () => veil.remove());
  }
  // Once the intro has finished (or been skipped) nothing in the sequence may carry on: its promises simply never
  // settle, so the code after an `await` never runs against elements that are gone
  const never = new Promise<void>(() => {});
  const kit: IntroKit = {
    get done() { return done; },
    reveal, finish,
    undo: (fn) => { undo.push(fn); },
    // Plays an animation that holds its end state until the intro finishes; resolves when it ends
    play(el, frames, opts = {}) {
      if (done || !el) return never;
      const a = el.animate(frames, { fill: 'both', ...opts });
      anims.push(a);
      return a.finished.then(() => {}, () => never);
    },
    // Keeps a real element invisible until its turn
    hold: (el) => kit.play(el, [{ opacity: 0 }, { opacity: 0 }], { duration: 1 }),
    wait: (ms) => new Promise((r) => setTimeout(() => { if (!done) r(); }, ms)),
    // Calls fn(progress 0..1) every frame for `ms`
    tween: (ms, fn) => new Promise((res) => {
      const t0 = performance.now();
      const step = (t: number) => { if (done) return; const p = Math.min(1, (t - t0) / ms); fn(p); if (p < 1) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    }),
    // Where `el` would have to move and scale (about its top left) to cover `to`
    flip(el, to) {
      const a = el.getBoundingClientRect();
      return `translate(${to.left - a.left}px, ${to.top - a.top}px) scale(${to.width / a.width}, ${to.height / a.height})`;
    },
  };
  if (scrollY > 40) { finish(); return; } // reopened part-way down: no intro
  EVENTS.forEach((t) => addEventListener(t, skip, { capture: true, passive: true }));
  setTimeout(() => finish(), 9000);
  Promise.resolve().then(() => run(kit)).then(() => finish(), (e) => { console.error(e); finish(true); });
}
