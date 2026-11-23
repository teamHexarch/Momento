'use client';

import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import ShellDialog, { type DialogHandle } from './ShellDialog';
import { ICON, shell } from './core';

/* Confirm, Ask and Choose: the shell's three question windows (Momento.confirm / ask / choose).
   Each resolves once: the answer, or false / null when closed (Cancel, the X, Escape, a press outside). */

export type ConfirmOpts = { title: string; body?: string; ok?: string; danger?: boolean; from?: HTMLElement | null };
export type AskOpts = { title: string; body?: string; label: string; type?: string; value?: string; placeholder?: string; ok?: string; check?: (v: string) => string; from?: HTMLElement | null };
export type Choice = { label: string; value: unknown; primary?: boolean; danger?: boolean };
export type ChooseOpts = { title: string; body?: string; choices: Choice[]; from?: HTMLElement | null };
export type QuestionHandle<O, R> = { ask(o: O): Promise<R> };

/** Asks before something is removed. Resolves true only for the confirm button */
export const ConfirmDialog = forwardRef<QuestionHandle<ConfirmOpts, boolean>>(function ConfirmDialog(_, ref) {
  const dlg = useRef<DialogHandle>(null);
  const done = useRef<((v: boolean) => void) | null>(null);
  const [q, setQ] = useState<Required<Omit<ConfirmOpts, 'from'>>>({ title: '', body: '', ok: 'Delete', danger: true });
  const answer = (v: boolean) => { const r = done.current; done.current = null; if (r) r(v); };
  useImperativeHandle(ref, () => ({
    ask: ({ title, body = '', ok = 'Delete', danger = true, from = null }) => new Promise((resolve) => {
      shell.returnTo = from;
      flushSync(() => setQ({ title, body, ok, danger }));
      done.current = resolve;
      dlg.current!.launch();
      dlg.current!.el()?.querySelector<HTMLElement>('.acct-ghost')?.focus(); // the safe choice has focus
    }),
  }));
  return (
    <ShellDialog id="mConfirm" ref={dlg} onClose={() => answer(false)}>
      <div className="acct-card">
        <i className="m-warn-ic" aria-hidden="true" hidden={!q.danger}>{ICON.bigBin()}</i>
        <h2 id="mConfirmTitle">{q.title}</h2>
        <p className="acct-sub">{q.body}</p>
        <div className="acct-actions"><button className="acct-ghost" type="button" data-close="">Cancel</button><button className={q.danger ? 'acct-primary is-danger' : 'acct-primary'} type="button" data-ok="" onClick={() => { const r = done.current; done.current = null; dlg.current!.dismiss(); if (r) r(true); }}>{q.ok}</button></div>
      </div>
    </ShellDialog>
  );
});

/** Asks for one value (an email address, say). Resolves the value, or null if cancelled */
export const AskDialog = forwardRef<QuestionHandle<AskOpts, string | null>>(function AskDialog(_, ref) {
  const dlg = useRef<DialogHandle>(null);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef<((v: string | null) => void) | null>(null);
  const check = useRef<AskOpts['check']>(undefined);
  const [q, setQ] = useState({ title: '', body: '', label: '', type: 'text', placeholder: '', ok: 'Continue' });
  const [status, setStatus] = useState('');
  useImperativeHandle(ref, () => ({
    ask: ({ title, body = '', label, type = 'text', value = '', placeholder = '', ok = 'Continue', check: c, from = null }) => new Promise((resolve) => {
      shell.returnTo = from;
      check.current = c;
      flushSync(() => { setQ({ title, body, label, type, placeholder, ok }); setStatus(''); });
      input.current!.value = value;
      done.current = resolve;
      dlg.current!.launch();
      input.current!.focus();
    }),
  }));
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.current!.value.trim(), problem = check.current ? check.current(v) : (v ? '' : `Enter ${q.label.toLowerCase()}.`);
    if (problem) { setStatus(problem); input.current!.focus(); return; }
    const r = done.current; done.current = null; dlg.current!.dismiss(); r?.(v);
  };
  return (
    <ShellDialog id="mAsk" ref={dlg} onClose={() => { const r = done.current; done.current = null; if (r) r(null); }}>
      <form className="acct-card" noValidate onSubmit={submit}>
        <button className="acct-x" type="button" aria-label="Close" data-close="">{ICON.close()}</button>
        <h2 id="mAskTitle">{q.title}</h2>
        <p className="acct-sub">{q.body}</p>
        <label className="acct-field"><span>{q.label}</span><input name="v" autoComplete="email" type={q.type} placeholder={q.placeholder} ref={input} /></label>
        <p className={status ? 'acct-status is-error' : 'acct-status'} role="status">{status}</p>
        <div className="acct-actions"><button className="acct-ghost" type="button" data-close="">Cancel</button><button className="acct-primary" type="submit">{q.ok}</button></div>
      </form>
    </ShellDialog>
  );
});

/** Asks the person to pick one of a few choices, stacked as full-width buttons (Social page). Resolves the value, or null */
export const ChooseDialog = forwardRef<QuestionHandle<ChooseOpts, unknown>>(function ChooseDialog(_, ref) {
  const dlg = useRef<DialogHandle>(null);
  const row = useRef<HTMLDivElement>(null);
  const done = useRef<((v: unknown) => void) | null>(null);
  const [q, setQ] = useState<{ title: string; body: string; choices: Choice[]; seq: number }>({ title: '', body: '', choices: [], seq: 0 });
  useImperativeHandle(ref, () => ({
    ask: ({ title, body = '', choices, from = null }) => new Promise((resolve) => {
      shell.returnTo = from;
      flushSync(() => setQ((o) => ({ title, body, choices, seq: o.seq + 1 })));
      done.current = resolve;
      dlg.current!.launch();
      row.current?.querySelector<HTMLElement>('.acct-primary, button')?.focus();
    }),
  }));
  return (
    <ShellDialog id="mChoose" ref={dlg} onClose={() => { const r = done.current; done.current = null; if (r) r(null); }}>
      <div className="acct-card">
        <button className="acct-x" type="button" aria-label="Close" data-close="">{ICON.close()}</button>
        <h2 id="mChooseTitle">{q.title}</h2>
        <p className="acct-sub">{q.body}</p>
        <div className="acct-actions is-stacked" ref={row}>
          {q.choices.map((c, i) => (
            // a new set of buttons each time it asks, as before
            <button key={`${q.seq}-${i}`} type="button" className={(c.primary ? 'acct-primary' : 'acct-ghost') + (c.danger ? ' is-danger' : '')}
              onClick={() => { const r = done.current; done.current = null; dlg.current!.dismiss(); if (r) r(c.value); }}>{c.label}</button>
          ))}
        </div>
      </div>
    </ShellDialog>
  );
});
