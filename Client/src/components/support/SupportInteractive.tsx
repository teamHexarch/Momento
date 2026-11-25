'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount } from '@/components/shared/AccountProvider';
import { api } from '@/lib/api';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const QA = [
  ['How do guests join an album?', 'They point their phone camera at the host’s QR code and the album opens. Signing up lets them add their own photos.'],
  ['Who can see the photos?', 'Only the people who joined the album. The host decides whether guests can see the gallery while the event is on.'],
  ['How long does an album stay open?', 'Uploads and downloads stay open for a while after the event, then the album is kept as an archive. Download your photos before it closes.'],
  ['Does it work with real cameras?', 'Yes. Sony ARW, Canon CR3, iPhone HEIC and ProRAW files all upload; camera RAW files are kept as full-size, high-quality JPEGs.'],
  ['Can I remove a photo I added?', 'Yes. Open the album, choose your photo and pick Delete. You can only remove the photos you added yourself.'],
];

/** Quick answers: one open at a time */
export function SupportFaq() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="panel sp-faq">
      {QA.map(([q, a], i) => (
        <div className={open === i ? 'qa is-open' : 'qa'} key={i}>
          <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}><span>{q}</span><i></i></button>
          <div className="qa-a"><p>{a}</p></div>
        </div>
      ))}
    </div>
  );
}

/** "Help and support: Open the help window" */
export function HelpRow({ children }: { children: React.ReactNode }) {
  return (
    <button className="s-row" type="button" id="openHelp" onClick={(e) => (window as unknown as { Momento: { openHelp(b: Element): void } }).Momento.openHelp(e.currentTarget)}>{children}</button>
  );
}

const TOPICS = [['Joining an album', 'Joining'], ['Uploads', 'Uploads'], ['Something else', 'Other']] as const;
type Field = 'name' | 'email' | 'message';
// form → leaving (slides out) → done → shown (settles in); Send another: returning (back, still slid out) → form
type View = 'form' | 'leaving' | 'done' | 'shown' | 'returning';

/**
 * Send us a message: name and email come from the account when there is one; a topic; the message. Sent to the team
 * (POST /api/support); "Message sent" only once the server has it. Then "Send another" brings the form back.
 */
export function SupportForm() {
  const account = useAccount();
  const form = useRef<HTMLFormElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  const doneTitle = useRef<HTMLHeadingElement>(null);
  const [topic, setTopic] = useState(0);
  const [note, setNote] = useState<{ text: string; error: boolean }>({ text: '', error: false });
  const [invalid, setInvalid] = useState<Field | null>(null);
  const [view, setView] = useState<View>('form');
  const [sentTo, setSentTo] = useState('');
  const busy = useRef(false);
  const input = (n: Field) => form.current!.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement;

  // Name and email come from the account when there is one (only into empty fields)
  useEffect(() => {
    if (!account) return;
    if (!input('name').value) input('name').value = account.name;
    if (!input('email').value) input('email').value = account.email;
  }, [account]);

  // The form slides out, then "Message sent" settles in and takes focus
  useEffect(() => {
    if (view === 'leaving') { const t = setTimeout(() => setView('done'), reduced() ? 0 : 240); return () => clearTimeout(t); }
    if (view === 'done') { const r = requestAnimationFrame(() => { setView('shown'); doneTitle.current!.focus({ preventScroll: true }); }); return () => cancelAnimationFrame(r); }
    if (view === 'returning') { const r = requestAnimationFrame(() => { setView('form'); input('message').focus(); }); return () => cancelAnimationFrame(r); }
  }, [view]);

  const fail = (text: string, field: Field) => { setNote({ text, error: true }); setInvalid(field); input(field).focus(); };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const name = input('name').value.trim(), email = input('email').value.trim(), message = input('message').value.trim();
    if (!name) return fail('Enter your name so we know who to reply to.', 'name');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter an email address like name@example.com.', 'email');
    if (message.length < 10) return fail('Tell us a little more. A sentence or two is plenty.', 'message');
    // (the button's label is set by hand, as before: the page's button effect rebuilds its inside)
    const b = send.current!;
    busy.current = true; form.current!.dataset.busy = 'true'; b.disabled = true; b.textContent = 'Sending…';
    setNote({ text: '', error: false });
    try {
      await api.support({ topic: TOPICS[topic][0], name, email, message });
    } catch (err) {
      setNote({ text: (err as Error).message || 'Your message didn’t send. Check your connection and try again.', error: true });
      return;
    } finally { busy.current = false; delete form.current!.dataset.busy; b.disabled = false; b.textContent = 'Send message'; }
    setSentTo(email);
    setView('leaving');
  };
  const again = () => {
    input('message').value = ''; setNote({ text: '', error: false });
    setView('returning');
  };
  const formShown = view === 'form' || view === 'leaving' || view === 'returning';

  return (
    <div className="panel s-list sp-card">
      <form id="supportForm" noValidate ref={form} className={view === 'leaving' || view === 'returning' ? 'is-out' : undefined} hidden={!formShown} onSubmit={submit}
        onInput={(e) => { setNote({ text: '', error: false }); if ((e.target as Element).getAttribute?.('aria-invalid')) setInvalid(null); }}>
        <div className="sp-pair">
          <label className="acct-field"><span>Your name</span><input name="name" autoComplete="name" placeholder="For example Priya Shah" aria-invalid={invalid === 'name' || undefined} /></label>
          <label className="acct-field"><span>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" aria-invalid={invalid === 'email' || undefined} /></label>
        </div>
        <span className="sp-label" id="topicLabel">What is it about?</span>
        <div className="acct-seg sp-seg" id="topicSeg" role="radiogroup" aria-labelledby="topicLabel" style={{ '--i': topic } as React.CSSProperties}>
          <span className="acct-seg-pill" aria-hidden="true"></span>
          {TOPICS.map(([value, label], i) => <button key={value} type="button" role="radio" aria-checked={topic === i} data-topic={value} onClick={() => setTopic(i)}>{label}</button>)}
        </div>
        <label className="acct-field"><span>Your message</span><textarea name="message" placeholder="Tell us what happened and what you expected." aria-invalid={invalid === 'message' || undefined}></textarea></label>
        <p className={note.error ? 'sp-note is-error' : 'sp-note'} id="formNote" role="status">{note.text}</p>
        <button className="btn btn-dark btn-sm" type="submit" ref={send}>Send message</button>
      </form>
      <div className={view === 'shown' ? 'sp-done is-in' : 'sp-done'} id="formDone" hidden={formShown}>
        <span className="sp-done-ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg></span>
        <h3 id="doneTitle" tabIndex={-1} ref={doneTitle}>Message sent</h3>
        <p>We’ll reply to <b id="doneMail">{sentTo}</b> within a day. Check your spam folder if you don’t see it.</p>
        <button className="btn btn-light btn-sm" type="button" id="sendAnother" onClick={again}>Send another</button>
      </div>
    </div>
  );
}
