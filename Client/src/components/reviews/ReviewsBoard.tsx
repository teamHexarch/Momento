'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/shared/AccountProvider';
import { api, type Review, type ReviewPart, type ReviewRole, type ReviewScores } from '@/lib/api';
import RollButton from '@/components/shared/RollButton';

/* The Reviews page: private feedback for the Momento team. Nobody sees anyone else's review. Everything is out of
   5 stars: the overall rating is the only thing needed, each part of Momento has its own optional row of stars, and
   host or guest and a comment are optional too. Once sent, you see your own answers with a way to change or delete
   them. Talks to /api/reviews (src/lib/api.ts; the shapes are in BACKEND-NOTES-NEXT.md). */

// What each overall rating means, in a guest's words (shown while choosing)
const MEANING = ['', 'It didn’t work for us', 'We had problems', 'It was okay', 'It worked well', 'We loved it'];
// The parts of Momento people use at an event, each rated out of 5 (same keys as the server's REVIEW_PARTS)
const PARTS: [ReviewPart, string][] = [['join', 'Joining the album'], ['upload', 'Adding photos'], ['quality', 'Photo quality'], ['find', 'Finding photos']];
const ROLES: [ReviewRole, string][] = [['host', 'The host'], ['guest', 'A guest']];
const MAX_BODY = 300;   // the server's limit (Server/src/utils/text.js LIMITS.reviewBody)
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
type MomentoGlobal = { Momento?: { sessionReady?: Promise<unknown>; account?: { get(): unknown }; toast?: (t: string, s?: string) => void; confirm?: (o: object) => Promise<boolean> } };
const M = () => (window as unknown as MomentoGlobal).Momento;

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

/** Choosing 1 to 5 stars: a radio group named by `labelId` (arrow keys move, hovering previews).
    `clearable`: pressing the chosen star again (or Delete) takes the rating away, for the optional rows */
function StarPicker({ value, onChange, labelId, size = 30, clearable = false, meaning = false, invalid = false }: {
  value: number; onChange: (n: number) => void; labelId: string; size?: number; clearable?: boolean; meaning?: boolean; invalid?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;
  const pick = (n: number) => {
    if (clearable && n === value) { onChange(0); return; }
    onChange(n);
    // The stars up to the one chosen give a small spring, one after another
    if (!reduced()) refs.current.slice(0, n).forEach((b, i) => b?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.28)', offset: .4 }, { transform: 'scale(1)' }], { duration: 420, delay: i * 45, easing: 'cubic-bezier(.34, 1.56, .64, 1)' }));
  };
  const onKey = (e: React.KeyboardEvent, n: number) => {
    if (clearable && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); onChange(0); return; }
    const to = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? Math.min(5, n + 1) : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? Math.max(1, n - 1) : e.key === 'Home' ? 1 : e.key === 'End' ? 5 : 0;
    if (!to) return;
    e.preventDefault(); onChange(to); refs.current[to - 1]?.focus();
  };
  return (
    <div className="rv-pick-wrap">
      <div className={invalid ? 'rv-pick is-invalid' : 'rv-pick'} role="radiogroup" aria-labelledby={labelId} aria-invalid={invalid || undefined} onPointerLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} ref={(el) => { refs.current[n - 1] = el; }} type="button" role="radio" aria-checked={value === n} aria-label={plural(n, 'star', 'stars')}
            tabIndex={(value || 1) === n ? 0 : -1} className={n <= shown ? 'rv-pick-star is-on' : 'rv-pick-star'} style={{ '--sz': `${size}px` } as React.CSSProperties}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') setHover(n); }} onClick={() => pick(n)} onKeyDown={(e) => onKey(e, n)}>
            <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true"><path d={STAR} /></svg>
          </button>
        ))}
      </div>
      {meaning && <span className="rv-pick-meaning" aria-live="polite">{shown ? MEANING[shown] : 'Tap a star to rate'}</span>}
    </div>
  );
}

/** One tappable answer (host or guest) */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className="rv-chip" aria-pressed={on} onClick={onClick}>
      <svg className="rv-chip-tick" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TICK} /></svg>
      {children}
    </button>
  );
}

/** Your own review, once sent: the overall stars, each part you rated, and your comment */
function YourAnswers({ r }: { r: Review }) {
  const rated = PARTS.filter(([p]) => r.scores?.[p]);
  return (
    <article className="rv-item">
      <div className="rv-overall">
        <Stars value={r.rating} size={20} label={`${r.rating} out of 5 overall`} />
        <span>{MEANING[r.rating]}</span>
      </div>
      {rated.length > 0 && (
        <dl className="rv-scores">
          {rated.map(([p, name]) => (
            <div key={p}><dt>{name}</dt><dd><Stars value={r.scores![p]!} size={14} label={`${r.scores![p]} out of 5`} /></dd></div>
          ))}
        </dl>
      )}
      {r.body && <p className="rv-body">{r.body}</p>}
      <footer className="rv-meta">
        {r.role && <span>{r.role === 'host' ? 'You were the host' : 'You were a guest'}</span>}
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

/** Leaving (or changing) your review: overall stars (needed), a row of stars for each part (optional), host or
    guest and a comment (optional) */
function Write({ mine, onSent, onCancel }: { mine: Review | null; onSent: (r: Review) => void; onCancel?: () => void }) {
  const [stars, setStars] = useState<number>(mine?.rating ?? 0);
  const [scores, setScores] = useState<ReviewScores>(mine?.scores ?? {});
  const [role, setRole] = useState<ReviewRole | undefined>(mine?.role);
  const [body, setBody] = useState(mine?.body ?? '');
  const [note, setNote] = useState<{ text: string; error: boolean }>({ text: '', error: false });
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Changing a review: start on the chosen overall star
  useEffect(() => { if (mine) formRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus(); }, [mine]);

  const rate = (n: number) => {
    setStars(n);
    if (invalid) { setInvalid(false); setNote({ text: '', error: false }); }
  };
  const score = (p: ReviewPart, n: number) => setScores((s) => {
    const next = { ...s };
    if (n) next[p] = n; else delete next[p];
    return next;
  });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!stars) { setInvalid(true); setNote({ text: 'Give Momento an overall rating from one to five stars.', error: true }); formRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    setBusy(true); setNote({ text: '', error: false });
    try {
      const r = await api.reviews.post({ rating: stars, scores, role, body: body.trim() || undefined });
      M()?.toast?.(mine ? 'Review changed' : 'Review sent', 'Thanks. Every answer helps us make Momento better.');
      onSent(r.review);
    } catch (err) {
      const er = err as Error & { status?: number };
      setNote({ text: er.status === 401 ? 'Log in again to send your review.' : er.message, error: true });
    } finally { setBusy(false); }
  };

  return (
    <div className="panel s-list sp-card rv-write">
      <form ref={formRef} noValidate onSubmit={submit} aria-busy={busy}>
        <span className="sp-label" id="rvStarsLabel">How did Momento do at your event overall?</span>
        <StarPicker labelId="rvStarsLabel" value={stars} onChange={rate} meaning invalid={invalid} />

        <div className="rv-parts">
          <p className="rv-parts-head" id="rvPartsHead">Rate the parts you used <small className="rv-optional">Skip any you didn’t</small></p>
          <div className="rv-rows" role="group" aria-labelledby="rvPartsHead">
            {PARTS.map(([p, name]) => (
              <div className="rv-row" key={p}>
                <span className="rv-row-name" id={`rvPart-${p}`}>{name}</span>
                <StarPicker labelId={`rvPart-${p}`} value={scores[p] ?? 0} onChange={(n) => score(p, n)} size={22} clearable />
              </div>
            ))}
            <div className="rv-row">
              <span className="rv-row-name" id="rvRoleLabel">You were</span>
              <div className="rv-chips" role="group" aria-labelledby="rvRoleLabel">
                {ROLES.map(([k, label]) => <Chip key={k} on={role === k} onClick={() => setRole(role === k ? undefined : k)}>{label}</Chip>)}
              </div>
            </div>
          </div>
        </div>

        <label className="acct-field rv-comment"><span>Anything else? <small className="rv-optional">(optional)</small></span>
          <textarea value={body} maxLength={MAX_BODY} rows={3} aria-describedby="rvCount" onChange={(e) => setBody(e.target.value)}
            placeholder={stars && stars <= 3 ? 'What got in the way? We read every comment.' : 'What should we keep doing, or do better?'} /></label>
        <div className="rv-form-foot">
          <span className="rv-private">Only the Momento team sees your answers.</span>
          <span className="rv-count" id="rvCount">{body.length.toLocaleString('en-GB')} / {MAX_BODY.toLocaleString('en-GB')}</span>
        </div>

        <p className={note.error ? 'sp-note is-error' : 'sp-note'} role="status">{note.text}</p>
        <div className="rv-form-acts">
          {onCancel && <button className="rv-cancel" type="button" onClick={onCancel}>Cancel</button>}
          <RollButton className="btn-dark btn-sm" type="submit" disabled={busy}>{busy ? 'Sending…' : mine ? 'Save changes' : 'Send review'}</RollButton>
        </div>
      </form>
    </div>
  );
}
