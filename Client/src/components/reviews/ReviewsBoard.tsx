'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/shared/AccountProvider';
import { api, type Review, type ReviewArea, type ReviewEvent, type ReviewRole } from '@/lib/api';
import RollButton from '@/components/shared/RollButton';

/* The Reviews page: private feedback for the Momento team. Nobody sees anyone else's review. Leaving one is a
   checklist: the stars are the only thing needed, everything else is an optional tap, and the comment box is
   optional too. Once sent, you see your own answers with a way to change or delete them.
   Talks to /api/reviews (src/lib/api.ts; the shapes are in BACKEND-NOTES-NEXT.md). */

// What each rating means, in a guest's words (shown while choosing)
const MEANING = ['', 'It didn’t work for us', 'We had problems', 'It was okay', 'It worked well', 'We loved it'];
// The checklist: the parts of Momento people touch at an event (same keys as the server's REVIEW_AREAS)
const AREAS: [ReviewArea, string][] = [['join', 'Joining'], ['upload', 'Adding photos'], ['quality', 'Photo quality'], ['find', 'Finding photos'], ['guests', 'Guests joining in'], ['privacy', 'Privacy']];
const AREA_NAME = Object.fromEntries(AREAS) as Record<ReviewArea, string>;
const ROLES: [ReviewRole, string][] = [['host', 'The host'], ['guest', 'A guest']];
const EVENTS: [ReviewEvent, string][] = [['wedding', 'Wedding'], ['birthday', 'Birthday'], ['party', 'Party'], ['work', 'Work event'], ['trip', 'Trip'], ['other', 'Something else']];
// "Hosted a wedding", "Guest at a party": the event in a sentence
const EVENT_PHRASE: Record<ReviewEvent, string> = { wedding: 'a wedding', birthday: 'a birthday', party: 'a party', work: 'a work event', trip: 'a trip', other: 'an event' };
const MAX_BODY = 1500;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
type MomentoGlobal = { Momento?: { sessionReady?: Promise<unknown>; account?: { get(): unknown }; toast?: (t: string, s?: string) => void; confirm?: (o: object) => Promise<boolean> } };
const M = () => (window as unknown as MomentoGlobal).Momento;

/** Where the person was: "Hosted a wedding", "Guest on a trip", "At a party" (empty when they didn't say) */
function context(r: Pick<Review, 'role' | 'event'>) {
  const ev = r.event ? EVENT_PHRASE[r.event] : '';
  if (r.role === 'host') return `Hosted ${ev || 'an event'}`;
  if (r.role === 'guest') return `Guest ${r.event === 'trip' ? 'on' : 'at'} ${ev || 'an event'}`;
  return ev ? `${r.event === 'trip' ? 'On' : 'At'} ${ev}` : '';
}

const STAR = 'M12 3.2l2.62 5.31 5.86.85-4.24 4.13 1 5.84L12 16.58l-5.24 2.75 1-5.84-4.24-4.13 5.86-.85Z';
const TICK = 'M5 12.5l4.2 4.2L19 7';
/** A row of five stars, filled to `value` */
function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  const row = (cls: string) => (
    <span className={cls} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <svg key={i} viewBox="0 0 24 24" width={size} height={size}><path d={STAR} /></svg>)}
    </span>
  );
  return (
    <span className="rv-stars" role="img" aria-label={label ?? `${value} out of 5 stars`}>
      {row('rv-stars-empty')}
      <span className="rv-stars-fill" style={{ width: `${pct}%` }}>{row('rv-stars-row')}</span>
    </span>
  );
}

/** Choosing 1 to 5 stars: a radio group (arrow keys move, hovering previews) */
function StarPicker({ value, onChange, invalid }: { value: number; onChange: (n: number) => void; invalid: boolean }) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;
  const pick = (n: number) => {
    onChange(n);
    // The stars up to the one chosen give a small spring, one after another
    if (!reduced()) refs.current.slice(0, n).forEach((b, i) => b?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: .4 }, { transform: 'scale(1)' }], { duration: 420, delay: i * 45, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }));
  };
  const onKey = (e: React.KeyboardEvent, n: number) => {
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, n + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(1, n - 1) : e.key === 'Home' ? 1 : e.key === 'End' ? 5 : 0;
    if (!to) return;
    e.preventDefault(); pick(to); refs.current[to - 1]?.focus();
  };
  return (
    <div className="rv-pick-wrap">
      <div className={invalid ? 'rv-pick is-invalid' : 'rv-pick'} role="radiogroup" aria-labelledby="rvStarsLabel" aria-invalid={invalid || undefined} onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} ref={(el) => { refs.current[n - 1] = el; }} type="button" role="radio" aria-checked={value === n} aria-label={plural(n, 'star', 'stars')}
            tabIndex={(value || 1) === n ? 0 : -1} className={n <= shown ? 'rv-pick-star is-on' : 'rv-pick-star'}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(n); }} onClick={() => pick(n)} onKeyDown={(e) => onKey(e, n)}>
            <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path d={STAR} /></svg>
          </button>
        ))}
      </div>
      <span className="rv-pick-meaning" aria-live="polite">{shown ? MEANING[shown] : 'Tap a star to rate'}</span>
    </div>
  );
}

/** One tappable answer. `tone` colours it once ticked: good (worked well), bad (could be better), or plain */
function Chip({ on, onClick, tone, children }: { on: boolean; onClick: () => void; tone?: 'good' | 'bad'; children: React.ReactNode }) {
  return (
    <button type="button" className={tone ? `rv-chip is-${tone}` : 'rv-chip'} aria-pressed={on} onClick={onClick}>
      <svg className="rv-chip-tick" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TICK} /></svg>
      {children}
    </button>
  );
}

/** Your own review, once sent: the stars, what you ticked and your comment */
function YourAnswers({ r }: { r: Review }) {
  const where = context(r);
  const worked = r.worked ?? [], better = r.better ?? [];
  return (
    <article className="rv-item">
      <Stars value={r.rating} label={plural(r.rating, 'star', 'stars')} />
      {(worked.length > 0 || better.length > 0) && (
        <dl className="rv-ticks">
          {worked.length > 0 && <div className="is-good"><dt>Worked well</dt><dd>{worked.map((a) => AREA_NAME[a]).join(', ')}</dd></div>}
          {better.length > 0 && <div className="is-bad"><dt>Could be better</dt><dd>{better.map((a) => AREA_NAME[a]).join(', ')}</dd></div>}
        </dl>
      )}
      {r.body && <p className="rv-body">{r.body}</p>}
      <footer className="rv-meta">
        {where && <span>{where}</span>}
        <time dateTime={r.updatedAt || r.createdAt}>{r.updatedAt ? 'Changed ' : 'Sent '}{when(r.updatedAt || r.createdAt)}</time>
      </footer>
    </article>
  );
}

export default function ReviewsBoard() {
  const account = useAccount();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [mine, setMine] = useState<Review | null | undefined>(undefined);   // undefined: still finding out
  const [editing, setEditing] = useState(false);

  // Whether there's an account: the session check answers a moment after the page opens
  useEffect(() => {
    const m = M();
    const done = () => setSignedIn(!!M()?.account?.get());
    m?.sessionReady ? m.sessionReady.then(done, done) : done();
  }, []);
  useEffect(() => { if (account) setSignedIn(true); }, [account]);
  // Signed in: whether you've already left a review (if this fails, the empty form still works)
  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api.reviews.mine().then((r) => { if (live) setMine(r.mine ?? null); }, () => { if (live) setMine(null); });
    return () => { live = false; };
  }, [signedIn]);

  const showForm = !mine || editing;
  return (
    <div className="rv-solo">
      <section className="s-group" style={{ '--d': '.25s' } as React.CSSProperties} aria-labelledby="rvWriteTitle">
        <h2 id="rvWriteTitle">{showForm ? (mine ? 'Change your review' : 'Leave a review') : 'Your review'}</h2>
        {signedIn === false ? <LogIn />
          : signedIn === null || mine === undefined ? <div className="panel s-list sp-card rv-write rv-wait" aria-busy="true"><i /><i /><i /></div>
            : showForm ? <Write mine={mine} onSent={(r) => { setMine(r); setEditing(false); }} onCancel={editing ? () => setEditing(false) : undefined} />
              : <Sent mine={mine} onEdit={() => setEditing(true)} onDeleted={() => setMine(null)} />}
      </section>
    </div>
  );
}

function LogIn() {
  return (
    <div className="panel s-list sp-card rv-write">
      <p className="rv-write-lede">Log in to leave a review. It takes a few taps, and only the Momento team sees it.</p>
      <RollButton className="btn-dark btn-sm rv-login" href="/?login=1&next=reviews">Log in to leave a review</RollButton>
    </div>
  );
}

/** After sending: thanks, your answers, and a way to change or delete them */
function Sent({ mine, onEdit, onDeleted }: { mine: Review; onEdit: () => void; onDeleted: () => void }) {
  const remove = async (from: HTMLElement) => {
    const m = M();
    const ok = await m?.confirm?.({ title: 'Delete your review?', body: 'Your answers are removed. You can leave a new review any time.', ok: 'Delete review', from });
    if (!ok) return;
    try { await api.reviews.remove(mine.id); m?.toast?.('Review deleted'); onDeleted(); }
    catch (err) { m?.toast?.('Couldn’t delete your review', (err as Error).message); }
  };
  return (
    <div className="panel s-list sp-card rv-write rv-mine">
      <p className="rv-thanks">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TICK} /></svg>
        Thanks for telling us how it went. Only the Momento team sees your review.
      </p>
      <YourAnswers r={mine} />
      <div className="rv-mine-acts">
        <RollButton className="btn-light btn-sm" onClick={onEdit}>Change answers</RollButton>
        <button className="rv-delete" type="button" onClick={(e) => remove(e.currentTarget)}>Delete</button>
      </div>
    </div>
  );
}

/** Leaving (or changing) your review. Only the stars are needed; picking them opens the optional taps and the comment box */
function Write({ mine, onSent, onCancel }: { mine: Review | null; onSent: (r: Review) => void; onCancel?: () => void }) {
  const [stars, setStars] = useState<number>(mine?.rating ?? 0);
  const [role, setRole] = useState<ReviewRole | undefined>(mine?.role);
  const [event, setEvent] = useState<ReviewEvent | undefined>(mine?.event);
  const [worked, setWorked] = useState<ReviewArea[]>(mine?.worked ?? []);
  const [better, setBetter] = useState<ReviewArea[]>(mine?.better ?? []);
  const [body, setBody] = useState(mine?.body ?? '');
  // A low first rating puts "What could be better?" first. Fixed at the first pick, so the lists don't swap mid-form
  const [lowFirst, setLowFirst] = useState(!!mine && mine.rating <= 3);
  const [note, setNote] = useState<{ text: string; error: boolean }>({ text: '', error: false });
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Changing a review: start on the chosen star
  useEffect(() => { if (mine) formRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus(); }, [mine]);

  const rate = (n: number) => {
    if (!stars) setLowFirst(n <= 3);
    setStars(n);
    if (invalid) { setInvalid(false); setNote({ text: '', error: false }); }
  };
  // An area is either working well or could be better: ticking it in one list unticks it in the other
  const tick = (list: 'worked' | 'better', a: ReviewArea) => {
    const [set, other] = list === 'worked' ? [setWorked, setBetter] : [setBetter, setWorked];
    set((l) => (l.includes(a) ? l.filter((x) => x !== a) : [...l, a]));
    other((l) => l.filter((x) => x !== a));
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!stars) { setInvalid(true); setNote({ text: 'Choose from one to five stars.', error: true }); formRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    setBusy(true); setNote({ text: '', error: false });
    try {
      const r = await api.reviews.post({ rating: stars, role, event, worked, better, body: body.trim() || undefined });
      M()?.toast?.(mine ? 'Review changed' : 'Review sent', 'Thanks. Every answer helps us make Momento better.');
      onSent(r.review);
    } catch (err) {
      const er = err as Error & { status?: number };
      setNote({ text: er.status === 401 ? 'Log in again to send your review.' : er.message, error: true });
    } finally { setBusy(false); }
  };

  const lists: ['worked' | 'better', string, ReviewArea[], 'good' | 'bad'][] = [['worked', 'What worked well?', worked, 'good'], ['better', 'What could be better?', better, 'bad']];
  if (lowFirst) lists.reverse();
  const placeholder = stars && stars <= 3 ? 'What got in the way? We read every comment.' : 'What was the event, and what should we keep doing?';
  return (
    <div className="panel s-list sp-card rv-write">
      <form ref={formRef} noValidate onSubmit={submit} aria-busy={busy}>
        <span className="sp-label" id="rvStarsLabel">How did Momento do at your event?</span>
        <StarPicker value={stars} invalid={invalid} onChange={rate} />
        {!stars && <p className="rv-hint">That’s the only question you have to answer. The rest is a few optional taps.</p>}

        {stars > 0 && (
          <div className="rv-qs">
            <div className="rv-q">
              <span className="sp-label" id="rvRoleLabel">You were</span>
              <div className="rv-chips" role="group" aria-labelledby="rvRoleLabel">
                {ROLES.map(([k, label]) => <Chip key={k} on={role === k} onClick={() => setRole(role === k ? undefined : k)}>{label}</Chip>)}
              </div>
            </div>
            <div className="rv-q">
              <span className="sp-label" id="rvEventLabel">The event</span>
              <div className="rv-chips" role="group" aria-labelledby="rvEventLabel">
                {EVENTS.map(([k, label]) => <Chip key={k} on={event === k} onClick={() => setEvent(event === k ? undefined : k)}>{label}</Chip>)}
              </div>
            </div>
            {lists.map(([key, label, ticked, tone]) => (
              <div className="rv-q" key={key}>
                <span className="sp-label" id={`rv-${key}-label`}>{label} <small className="rv-optional">Tick any</small></span>
                <div className="rv-chips" role="group" aria-labelledby={`rv-${key}-label`}>
                  {AREAS.map(([a, name]) => <Chip key={a} tone={tone} on={ticked.includes(a)} onClick={() => tick(key, a)}>{name}</Chip>)}
                </div>
              </div>
            ))}
            <label className="acct-field rv-q"><span>Anything else? <small className="rv-optional">(optional)</small></span>
              <textarea value={body} maxLength={MAX_BODY} rows={3} aria-describedby="rvCount" onChange={(e) => setBody(e.target.value)} placeholder={placeholder} /></label>
            <div className="rv-form-foot">
              <span className="rv-private">Only the Momento team sees your answers.</span>
              <span className="rv-count" id="rvCount">{body.length.toLocaleString('en-GB')} / {MAX_BODY.toLocaleString('en-GB')}</span>
            </div>
          </div>
        )}

        <p className={note.error ? 'sp-note is-error' : 'sp-note'} role="status">{note.text}</p>
        <div className="rv-form-acts">
          {onCancel && <button className="rv-cancel" type="button" onClick={onCancel}>Cancel</button>}
          <RollButton className="btn-dark btn-sm" type="submit" disabled={busy}>{busy ? 'Sending…' : mine ? 'Save changes' : 'Send review'}</RollButton>
        </div>
      </form>
    </div>
  );
}
