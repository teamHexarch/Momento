'use client';

import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import ShellDialog, { type DialogHandle } from './ShellDialog';
import { ICON, momentoGlobal, reducedMotion } from './core';
import { api, type AlbumSummary } from '@/lib/api';

export type CreateOpts = { groupId?: string; groupName?: string; kind?: string };
export type CreateHandle = { open(opts?: CreateOpts): void };

/** The markup, rendered once and never again: event.js fills the event step and other scripts reach in by id */
const CreateMarkup = memo(function CreateMarkup() {
  return (
    <form className="acct-card" noValidate>
      <button className="acct-x" type="button" aria-label="Close" data-close="">{ICON.close()}</button>
      <div className="m-view" data-view="form">
        <h2 id="mCreateTitle" tabIndex={-1}>Create an album</h2>
        <p className="m-progress" data-create-progress="">Step 1 of 2</p>
        <div data-create-step="details">
          <label className="acct-field m-first"><span data-name-label="">Album name</span><input name="name" maxLength={60} placeholder="Enter album name" autoComplete="off" /></label>
          <label className="acct-field m-date"><span>Date</span><input name="date" type="date" placeholder="Enter a date" /></label>
          <div className="m-kind" role="radiogroup" aria-labelledby="mKindTitle">
            <span className="m-kind-title" id="mKindTitle">What is it?</span>
            <label><input type="radio" name="kind" value="album" defaultChecked /><b>Album</b><small>Photos together, any time. Join with the code or link</small></label>
            <label><input type="radio" name="kind" value="event" /><b>Event</b><small>A time and a place, with a sharing zone</small></label>
          </div>
          {/* Events only: games for the guests or not (assets/event.js sends the answer; changeable in Album settings) */}
          <div className="m-kind m-games" role="radiogroup" aria-labelledby="mGamesTitle" hidden>
            <span className="m-kind-title" id="mGamesTitle">Would you like games at your event?</span>
            <label><input type="radio" name="games" value="yes" defaultChecked /><b>Yes, add games</b><small>Polls, quizzes, photo battles and more, with a leaderboard and winners</small></label>
            <label><input type="radio" name="games" value="no" /><b>No games</b><small>Just photos. You can turn games on later in Album settings</small></label>
          </div>
          <input name="place" type="hidden" />
          <label className="acct-field m-group m-share" hidden><span>Share with</span><select name="group"></select></label>
        </div>
        <div data-create-step="event" hidden></div>
        <p className="acct-status" role="status"></p>
        <div className="acct-actions"><button className="acct-ghost" type="button" data-create-back="">Cancel</button><button className="acct-primary" type="submit">Next</button></div>
      </div>
      <div className="m-view m-done" data-view="done" hidden>
        <i className="m-done-ic" aria-hidden="true">{ICON.bigCheck()}</i>
        <h2 tabIndex={-1}>Album created</h2>
        <p className="acct-sub"></p>
        {/* One obvious next step (share), one after it (open the album); the QR tile above enlarges when tapped
            (assets/qr.js) and the rarely used extras sit quietly at the foot */}
        <div className="m-code"><span><small>Guest code</small><b></b></span><button className="m-copy" type="button">Copy code</button></div>
        <div className="acct-actions m-next"><button className="acct-primary" type="button" data-copy-link="">Share link</button></div>
        <div className="acct-actions m-next"><button className="acct-ghost" type="button" data-view-album="">View album</button></div>
        <div className="m-more">
          <button className="m-quiet" type="button" data-album-settings="" hidden>Album settings</button>
          <button className="m-quiet is-danger" type="button" data-delete="">Delete this album</button>
        </div>
      </div>
    </form>
  );
});

/**
 * Create an album (Momento.createAlbum, and any [data-create] control): name, date, album or event, who it's shared
 * with; an event gets a second step (times and venue, from assets/event.js). Ends on a "created" screen with the guest
 * code, invite link, QR code, View album and Delete. The logic is the old shared script's, unchanged, attached to the
 * markup above once it exists.
 */
const CreateDialog = forwardRef<CreateHandle, { viewAlbum: (id: string) => void }>(function CreateDialog({ viewAlbum }, ref) {
  const dlg = useRef<DialogHandle>(null);
  const openRef = useRef<(opts?: CreateOpts) => void>(() => {});
  const viewRef = useRef(viewAlbum);
  viewRef.current = viewAlbum;
  useImperativeHandle(ref, () => ({ open: (opts) => openRef.current(opts) }));

  useEffect(() => {
    const d = dlg.current!.el()!;
    const M = momentoGlobal();
    // A form exposes its named controls as properties (F.name is the input named "name"); the old code relies on it
    const form = d.querySelector('form')!;
    const F = form as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const status = d.querySelector<HTMLElement>('.acct-status')!;
    const views = [...d.querySelectorAll<HTMLElement>('.m-view')];
    const showView = (v: string) => views.forEach((x) => { x.hidden = x.dataset.view !== v; });
    const submit = form.querySelector<HTMLButtonElement>('[type="submit"]')!, back = form.querySelector<HTMLButtonElement>('[data-create-back]')!;
    const title = d.querySelector<HTMLElement>('#mCreateTitle')!, progress = d.querySelector<HTMLElement>('[data-create-progress]')!;
    const steps = [...d.querySelectorAll<HTMLElement>('[data-create-step]')];
    const kindField = d.querySelector<HTMLElement>('.m-kind');
    // Only an event asks for times and a venue; an album (and a friend-group album) is just its name and date
    const isEvent = () => !F.group?.value && F.kind?.value === 'event';
    let step = 'details';
    let made: AlbumSummary | null = null; // the created album (you host it, so it has its code)
    const say = (msg: string, field?: HTMLElement) => {
      form.querySelectorAll('.m-field-error').forEach((el) => el.remove());
      form.querySelectorAll('[aria-invalid="true"]').forEach((el) => {
        el.removeAttribute('aria-invalid');
        const ids = (el.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== 'mCreateError');
        if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
      });
      status.textContent = field ? '' : msg;
      status.classList.toggle('is-error', !!msg && !field);
      if (msg && field) {
        const error = document.createElement('small');
        error.className = 'm-field-error'; error.id = 'mCreateError'; error.setAttribute('role', 'alert'); error.textContent = msg;
        (field.closest('.acct-field, .ev-sec') || field.parentElement)!.append(error);
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
        field.focus();
      }
    };
    const showStep = (next: string, focus = false) => {
      const grouped = !!F.group?.value, event = isEvent();
      step = event ? next : 'details';
      steps.forEach((panel) => { panel.hidden = panel.dataset.createStep !== step; });
      if (kindField) kindField.hidden = grouped;
      // "Would you like games at your event?" only for an event (not an album, not a friend group's album)
      const gamesField = form.querySelector<HTMLElement>('.m-games');
      if (gamesField) gamesField.hidden = !event;
      // An event's date and time are on step two (Starts and Ends), so step one has no date
      form.querySelector<HTMLElement>('.m-date')!.hidden = event;
      form.querySelector<HTMLElement>('[data-name-label]')!.textContent = event ? 'Event name' : 'Album name';
      F.name.placeholder = event ? 'Enter event name' : 'Enter album name';
      title.textContent = step === 'event' ? 'Event details' : event ? 'Create an event' : 'Create an album';
      progress.hidden = !event;
      progress.textContent = step === 'event' ? 'Step 2 of 2' : 'Step 1 of 2';
      submit.textContent = event ? (step === 'event' ? 'Create event' : 'Next') : 'Create album';
      const first = F.group?.options?.[0];
      if (first && !first.value) first.textContent = event ? 'Guests at the event' : 'Anyone with the code or link';
      back.textContent = step === 'event' ? 'Back' : 'Cancel';
      if (step === 'event') M.event?.activate(form);
      d.scrollTop = 0;
      if (focus) title.focus({ preventScroll: true });
    };
    back.addEventListener('click', () => {
      if (form.dataset.busy) return;
      if (step === 'event') { say(''); showStep('details', true); } else dlg.current!.dismiss();
    });
    form.addEventListener('input', (e) => { if ((e.target as Element).getAttribute('aria-invalid') === 'true') say(''); });
    form.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).name === 'kind') { say(''); showStep('details'); } });

    // "Share with": an event's guests (they join with the code), or one of your friend groups (everyone in it sees the
    // album). A dropdown, shown only when you have groups; fetched each time the form opens (a group may be new or gone)
    const groupField = d.querySelector<HTMLElement>('.m-group')!;
    const shareList = groupField.querySelector('select')!;
    const shareOption = (value: string, text: string) => { const o = document.createElement('option'); o.value = value; o.textContent = text; return o; };
    shareList.addEventListener('change', () => { say(''); showStep('details'); });
    let groupsAsked = 0;
    async function loadGroups(groupId?: string, groupName?: string) {
      const ask = ++groupsAsked;
      if (groupId) {
        shareList.replaceChildren(shareOption(groupId, groupName || 'This group'));
        shareList.value = groupId;
        groupField.hidden = false;
        return;
      }
      // Your groups as remembered for this tab (assets/event.js, Momento.myGroups): the field is there as the form
      // opens, not a moment later. The fresh list follows and only changes what's different
      type G = { id: string; name: string };
      const fill = (groups: G[]) => {
        const keep = shareList.value;
        shareList.replaceChildren(shareOption('', 'Guests at the event'), ...groups.map((g) => shareOption(g.id, g.name)));
        if (groups.some((g) => g.id === keep)) shareList.value = keep;
        groupField.hidden = !groups.length;
        shareList.options[0].textContent = isEvent() ? 'Guests at the event' : 'Anyone with the code or link'; // (as showStep words it)
      };
      const known: G[] | null = M.myGroups?.cached();
      fill(known || []);
      let groups: G[];
      try { groups = M.myGroups ? await M.myGroups.refresh() : (await api.groups.list()).groups; } catch { return; }
      if (ask !== groupsAsked) return;
      if (JSON.stringify(groups.map((g) => [String(g.id), g.name])) !== JSON.stringify((known || []).map((g) => [g.id, g.name]))) fill(groups);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (form.dataset.busy || made) return;
      const name = F.name.value.trim();
      let date = F.date.value;
      let place = F.place.value.trim();
      if (!name) { showStep('details'); say(isEvent() ? 'Enter an event name.' : 'Enter an album name.', F.name); return; }
      if (!date && !isEvent()) { showStep('details'); say('Choose a date.', F.date); return; }
      // Group albums finish here. Event albums collect times and a venue on the next screen.
      const groupId = shareList.value || '', groupName = groupId ? shareList.selectedOptions[0]?.textContent || '' : '';
      const event = isEvent();
      if ((event || groupId) && !M.event) { say('Event details couldn’t load. Refresh the page and try again.'); return; }
      if (event && step === 'details') { say(''); showStep('event', true); return; }
      // An event: its times and venue. A group album: what the group needs. An album: nothing more
      const ev = event || groupId ? M.event.read(form) : { fields: { place: '' } };
      if (ev.error) { say(ev.error, ev.focus); return; }
      if (ev.fields.place !== undefined) place = ev.fields.place;
      if (ev.fields.date) date = ev.fields.date;
      say('');
      form.dataset.busy = 'true';
      submit.disabled = back.disabled = true;
      try {
        ({ album: made } = await api.albums.create({ name, date, place, ...ev.fields, ...(groupId && { groupId }) }));
        // An event checks guests' location only when the host ticked it (the server's default is to check): saved now,
        // so the first guest isn't asked. If it doesn't save, the host can still change it in Album settings.
        if (made && event && ev.fields.locationRequired === false) {
          await api.events.policy(made.id, { locationRequired: false }).catch(() => api.events.policy(made!.id, { locationRequired: false })).catch((err) => console.warn('Couldn’t turn the location check off:', err));
        }
        document.dispatchEvent(new CustomEvent('momento:albums', { detail: { type: 'add', album: made } }));
      } catch (err) { say((err as Error).message); return; }
      finally { delete form.dataset.busy; submit.disabled = back.disabled = false; }
      const when = new Date(date + 'T12:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      d.querySelector('.m-done .acct-sub')!.textContent = `“${name}” is ready for ${when}${place ? ` in ${place}` : ''}.${groupName ? ` Everyone in ${groupName} can see it already. Share this code with anyone else you want in.` : ' Share this code so guests can join and add their photos.'}`;
      d.querySelector('.m-code b')!.textContent = made!.code || '';
      d.querySelector('.m-copy')!.textContent = 'Copy code';
      d.querySelector('[data-copy-link]')!.textContent = 'Share link';
      showView('done');
      if (!reducedMotion()) [...d.querySelector('.m-done')!.children].forEach((el, i) => el.animate(
        [{ opacity: 0, transform: i ? 'translateY(10px)' : 'scale(.4)' }, { opacity: 1, transform: 'none' }],
        { duration: i ? 460 : 620, delay: i * 55, easing: i ? 'cubic-bezier(.16, 1, .3, 1)' : 'cubic-bezier(.34, 1.56, .64, 1)', fill: 'backwards' }));
      d.querySelector<HTMLElement>('.m-done h2')!.focus();
    });
    d.querySelector('.m-copy')!.addEventListener('click', async (e) => {
      const b = e.currentTarget as HTMLElement;
      try { await navigator.clipboard.writeText(made!.code || ''); b.textContent = 'Copied'; } catch { b.textContent = 'Select and copy'; }
      setTimeout(() => { b.textContent = 'Copy code'; }, 1800);
    });
    // A phone opens its share sheet; a computer copies the link (and says so on the button)
    d.querySelector('[data-copy-link]')!.addEventListener('click', (e) => M.shareInvite(made, e.currentTarget, 'Share link'));
    d.querySelector('[data-view-album]')!.addEventListener('click', async () => { const id = made!.id; await dlg.current!.dismiss(); viewRef.current(id); });
    d.querySelector('[data-delete]')!.addEventListener('click', async (e) => {
      if (await M.removeAlbum({ ...made, photos: 0 }, e.currentTarget)) dlg.current!.dismiss();
    });

    openRef.current = (opts: CreateOpts = {}) => {
      form.reset(); made = null; say('');
      d.querySelector<HTMLElement>('[data-album-settings]')!.hidden = true; // (album-settings.js shows it for the new album)
      loadGroups(opts.groupId, opts.groupName);
      // (the date starts empty: the field says "Enter a date" and its calendar opens on today)
      // "Create an event" opens with Event chosen, "Create an album" with Album
      const kind = form.querySelector<HTMLInputElement>(`input[name="kind"][value="${opts.kind === 'event' ? 'event' : 'album'}"]`);
      if (kind) kind.checked = true;
      M.event?.mount(form, { fromGroup: Boolean(opts.groupId) });
      showStep('details');
      showView('form');
      dlg.current!.launch();
      F.name.focus();
    };
  }, []);

  return <ShellDialog id="mCreate" ref={dlg}><CreateMarkup /></ShellDialog>;
});

export default CreateDialog;
