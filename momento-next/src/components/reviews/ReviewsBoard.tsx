'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/shared/AccountProvider';
import { api, type Review, type ReviewSort, type ReviewSummary } from '@/lib/api';
import RollButton from '@/components/shared/RollButton';

/* The Reviews page: the overall score, writing (or editing) your review, and everyone's reviews.
   Talks to /api/reviews (src/lib/api.ts; the shapes are in BACKEND-NOTES.md). */

const SORTS: [ReviewSort, string][] = [['newest', 'Newest'], ['highest', 'Highest'], ['lowest', 'Lowest']];
// What each rating means, in a guest's words (shown while choosing)
const MEANING = ['', 'It didn’t work for us', 'We had problems', 'It was okay', 'It worked well', 'We loved it'];
const MAX_BODY = 1500, MIN_BODY = 20, MAX_TITLE = 80;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const when = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;

const STAR = 'M12 3.2l2.62 5.31 5.86.85-4.24 4.13 1 5.84L12 16.58l-5.24 2.75 1-5.84-4.24-4.13 5.86-.85Z';
/** A row of five stars, filled to `value` (a part star for averages like 4.6) */
export function Stars({ value, size = 16, label }: { value: number; size?: number; label?: string }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  const row = (cls: string) => (
    <span className={cls} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <svg key={i} viewBox="0 0 24 24" width={size} height={size}><path d={STAR} /></svg>)}
    </span>
  );
  return (
    <span className="rv-stars" role="img" aria-label={label ?? `${Math.round(value * 10) / 10} out of 5 stars`}>
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
      <div className={invalid ? 'rv-pick is-invalid' : 'rv-pick'} role="radiogroup" aria-label="Your rating" aria-invalid={invalid || undefined} onPointerLeave={() => setHover(0)}>
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

type Load = { state: 'loading' | 'ready' | 'error'; message?: string };

export default function ReviewsBoard() {
  const account = useAccount();
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [mine, setMine] = useState<Review | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [rating, setRating] = useState(0);   // the list's star filter (0: every review)
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [more, setMore] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const ask = useRef(0);

  const fetchPage = useCallback(async (cursor: string | null) => {
    const id = ++ask.current;
    if (cursor) setMore(true); else setLoad({ state: 'loading' });
    try {
      const r = await api.reviews.list({ sort, rating: rating || undefined, cursor });
      if (id !== ask.current) return;
      setSummary(r.summary);
      setMine(r.mine ?? null);
      setReviews((old) => (cursor ? [...old, ...r.reviews] : r.reviews));
      setNext(r.next ?? null);
      setLoad({ state: 'ready' });
    } catch (err) {
      if (id !== ask.current) return;
      if (cursor) setLoad({ state: 'ready', message: (err as Error).message });
      else setLoad({ state: 'error', message: (err as Error).message });
    } finally { if (id === ask.current) setMore(false); }
  }, [sort, rating]);

  useEffect(() => { fetchPage(null); }, [fetchPage]);
  // Whether there's an account: the session check answers a moment after the page opens
  useEffect(() => {
    const M = (window as unknown as { Momento?: { sessionReady?: Promise<unknown> } }).Momento;
    const done = () => setSignedIn(!!(window as unknown as { Momento: { account: { get(): unknown } } }).Momento.account?.get());
    M?.sessionReady ? M.sessionReady.then(done, done) : done();
  }, []);
  useEffect(() => { if (account) setSignedIn(true); }, [account]);

  // After posting or deleting: the summary from the server, and the list again from the top
  const changed = (s?: ReviewSummary) => { if (s) setSummary(s); fetchPage(null); };

  return (
    <div className="rv-cols">
      <aside className="rv-side">
        <section className="s-group" style={{ '--d': '.25s' } as React.CSSProperties} aria-labelledby="rvSumTitle">
          <h2 id="rvSumTitle">Overall</h2>
          <Summary summary={summary} failed={load.state === 'error' && !summary} rating={rating} onRating={(n) => setRating(rating === n ? 0 : n)} />
        </section>
        <section className="s-group" style={{ '--d': '.31s' } as React.CSSProperties} aria-labelledby="rvWriteTitle">
          <h2 id="rvWriteTitle">{mine ? 'Your review' : 'Write a review'}</h2>
          <Write mine={mine} signedIn={signedIn} accountName={account?.name || ''} onChanged={changed} />
        </section>
      </aside>

      <section className="s-group rv-main" style={{ '--d': '.37s' } as React.CSSProperties} aria-labelledby="rvListTitle">
        <h2 id="rvListTitle">What people say</h2>
        <div className="rv-listbar">
          <div className="acct-seg rv-seg" role="radiogroup" aria-label="Sort reviews" style={{ '--i': SORTS.findIndex(([k]) => k === sort) } as React.CSSProperties}>
            <span className="acct-seg-pill" aria-hidden="true"></span>
            {SORTS.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={sort === k} onClick={() => setSort(k)}>{label}</button>)}
          </div>
          {rating > 0 && (
            <button className="rv-filter" type="button" onClick={() => setRating(0)} aria-label={`Showing ${plural(rating, 'star', 'stars')} reviews only. Show every review`}>
              {plural(rating, 'star', 'stars')} only
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          )}
        </div>

        <div className="panel rv-list" aria-busy={load.state === 'loading'}>
          {load.state === 'loading' && !reviews.length && (
            <div className="rv-skeleton" aria-hidden="true">{[0, 1, 2].map((i) => <div key={i} className="rv-skel-row"><i /><i /><i /></div>)}</div>
          )}
          {load.state === 'error' && (
            <div className="rv-empty" role="alert">
              <b>Reviews didn’t load</b>
              <span>{load.message || 'Check your connection, then try again.'}</span>
              <RollButton className="btn-light btn-sm" onClick={() => fetchPage(null)}>Try again</RollButton>
            </div>
          )}
          {load.state !== 'error' && load.state !== 'loading' && !reviews.length && (
            <div className="rv-empty">
              <b>{rating ? `No ${plural(rating, 'star', 'stars')} reviews yet` : 'No reviews yet'}</b>
              <span>{rating ? 'Try another rating, or show every review.' : 'Used Momento at an event? Be the first to say how it went.'}</span>
            </div>
          )}
          {reviews.map((r) => <ReviewItem key={r.id} r={r} />)}
          {(next || load.message) && load.state === 'ready' && (
            <div className="rv-more">
              {load.message && <p className="rv-more-note" role="status">{load.message}</p>}
              {next && <RollButton className="btn-light btn-sm" disabled={more} onClick={() => fetchPage(next)}>{more ? 'Loading…' : 'Show more reviews'}</RollButton>}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Summary({ summary, failed, rating, onRating }: { summary: ReviewSummary | null; failed: boolean; rating: number; onRating: (n: number) => void }) {
  const count = summary?.count ?? 0;
  return (
    <div className="panel rv-summary">
      <div className="rv-score">
        <b className="rv-avg">{summary && count ? summary.average.toFixed(1) : '–'}</b>
        <span className="rv-score-side">
          <Stars value={summary?.average ?? 0} size={18} label={summary && count ? `Average ${summary.average.toFixed(1)} out of 5` : 'No ratings yet'} />
          <small>{summary ? (count ? `from ${plural(count, 'review', 'reviews')}` : 'No reviews yet') : failed ? 'The score didn’t load' : 'Loading…'}</small>
        </span>
      </div>
      {/* One bar per rating: how many gave it. Pressing one shows only those reviews */}
      <ul className="rv-bars" aria-label="Reviews by rating">
        {[5, 4, 3, 2, 1].map((n) => {
          const c = summary?.counts?.[String(n) as '1'] ?? 0, pct = count ? (c / count) * 100 : 0;
          return (
            <li key={n}>
              <button className="rv-bar" type="button" aria-pressed={rating === n} disabled={!c && rating !== n} onClick={() => onRating(n)}
                aria-label={`${plural(n, 'star', 'stars')}: ${plural(c, 'review', 'reviews')}${rating === n ? '. Showing only these' : '. Show only these'}`}>
                <span className="rv-bar-n">{n}</span>
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><path d={STAR} /></svg>
                <span className="rv-track" aria-hidden="true"><i style={{ transform: `scaleX(${pct / 100})` }} /></span>
                <span className="rv-bar-c">{c.toLocaleString('en-GB')}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReviewItem({ r }: { r: Review }) {
  return (
    <article className={r.you ? 'rv-item is-you' : 'rv-item'}>
      <header className="rv-item-head">
        <Stars value={r.rating} label={plural(r.rating, 'star', 'stars')} />
        {r.you && <span className="rv-you">Your review</span>}
      </header>
      {r.title && <h3 className="rv-title">{r.title}</h3>}
      <p className="rv-body">{r.body}</p>
      <footer className="rv-meta"><b>{r.name}</b><time dateTime={r.createdAt}>{when(r.createdAt)}{r.updatedAt ? ' (edited)' : ''}</time></footer>
    </article>
  );
}

/** Writing your review, or (once you have one) seeing it with Edit and Delete. Signed out: a way to log in */
function Write({ mine, signedIn, accountName, onChanged }: { mine: Review | null; signedIn: boolean | null; accountName: string; onChanged: (s?: ReviewSummary) => void }) {
  const [editing, setEditing] = useState(false);
  const [stars, setStars] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [note, setNote] = useState<{ text: string; error: boolean }>({ text: '', error: false });
  const [invalid, setInvalid] = useState<'stars' | 'body' | null>(null);
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const startEdit = () => {
    if (mine) { setStars(mine.rating); setTitle(mine.title || ''); setBody(mine.body); }
    setNote({ text: '', error: false }); setInvalid(null); setEditing(true);
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[role="radio"][tabindex="0"]')?.focus());
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const text = body.trim();
    if (!stars) { setInvalid('stars'); setNote({ text: 'Choose from one to five stars.', error: true }); formRef.current?.querySelector<HTMLElement>('[role="radio"]')?.focus(); return; }
    if (text.length < MIN_BODY) { setInvalid('body'); setNote({ text: `Write a little more: at least ${MIN_BODY} characters.`, error: true }); bodyRef.current?.focus(); return; }
    setBusy(true); setNote({ text: '', error: false }); setInvalid(null);
    try {
      const r = await api.reviews.post({ rating: stars, title: title.trim() || undefined, body: text });
      setEditing(false); setStars(0); setTitle(''); setBody('');
      (window as unknown as { Momento?: { toast?: (t: string, s?: string) => void } }).Momento?.toast?.(mine ? 'Review updated' : 'Review posted', 'Thanks for telling us how it went.');
      onChanged(r.summary);
    } catch (err) {
      const er = err as Error & { status?: number };
      setNote({ text: er.status === 401 ? 'Log in again to post your review.' : er.message, error: true });
    } finally { setBusy(false); }
  };
  const remove = async (from: HTMLElement) => {
    if (!mine) return;
    const M = (window as unknown as { Momento: { confirm(o: object): Promise<boolean>; toast(t: string, s?: string): void } }).Momento;
    const ok = await M.confirm({ title: 'Delete your review?', body: 'It comes off the Reviews page for everyone. You can write a new one any time.', ok: 'Delete review', from });
    if (!ok) return;
    try { const r = await api.reviews.remove(mine.id); M.toast('Review deleted'); setEditing(false); onChanged(r.summary); }
    catch (err) { M.toast('Couldn’t delete your review', (err as Error).message); }
  };

  if (signedIn === false) {
    return (
      <div className="panel s-list sp-card rv-write">
        <p className="rv-write-lede">Log in to write a review. It only takes a moment, and you can edit it later.</p>
        <RollButton className="btn-dark btn-sm rv-login" href="/?login=1&next=reviews">Log in to write a review</RollButton>
      </div>
    );
  }
  if (mine && !editing) {
    return (
      <div className="panel s-list sp-card rv-write rv-mine">
        <ReviewItem r={mine} />
        <div className="rv-mine-acts">
          <RollButton className="btn-light btn-sm" onClick={startEdit}>Edit review</RollButton>
          <button className="rv-delete" type="button" onClick={(e) => remove(e.currentTarget)}>Delete</button>
        </div>
      </div>
    );
  }
  return (
    <div className="panel s-list sp-card rv-write">
      <form ref={formRef} noValidate onSubmit={submit} aria-busy={busy}>
        <span className="sp-label" id="rvStarsLabel">How did Momento do at your event?</span>
        <StarPicker value={stars} invalid={invalid === 'stars'} onChange={(n) => { setStars(n); if (invalid === 'stars') { setInvalid(null); setNote({ text: '', error: false }); } }} />
        <label className="acct-field"><span>Title <small className="rv-optional">(optional)</small></span>
          <input value={title} maxLength={MAX_TITLE} onChange={(e) => setTitle(e.target.value)} placeholder="For example: Our wedding album" /></label>
        <label className="acct-field"><span>Your review</span>
          <textarea ref={bodyRef} value={body} maxLength={MAX_BODY} aria-invalid={invalid === 'body' || undefined} aria-describedby="rvCount"
            onChange={(e) => { setBody(e.target.value); if (invalid === 'body') { setInvalid(null); setNote({ text: '', error: false }); } }}
            placeholder="What kind of event was it, and how did guests find adding their photos?" /></label>
        <div className="rv-form-foot">
          <p className={note.error ? 'sp-note is-error' : 'sp-note'} role="status">{note.text}</p>
          <span className="rv-count" id="rvCount">{body.length.toLocaleString('en-GB')} / {MAX_BODY.toLocaleString('en-GB')}</span>
        </div>
        {accountName && <p className="rv-as">Posting as {accountName.trim().split(/\s+/)[0]}{accountName.trim().split(/\s+/)[1] ? ` ${accountName.trim().split(/\s+/)[1][0]}.` : ''}</p>}
        <div className="rv-form-acts">
          {editing && <button className="rv-cancel" type="button" onClick={() => { setEditing(false); setNote({ text: '', error: false }); }}>Cancel</button>}
          <RollButton className="btn-dark btn-sm" type="submit" disabled={busy}>{busy ? 'Posting…' : editing ? 'Save changes' : 'Post review'}</RollButton>
        </div>
      </form>
    </div>
  );
}
