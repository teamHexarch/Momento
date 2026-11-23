import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';

export default function EventsPage() {
  return (
    <>
        <div className="page-wrap" id="pageWrap">
      <noscript dangerouslySetInnerHTML={{ __html: "<style>.page.is-settling :is(#soNeed, #groups, #events) { visibility: visible; }</style>" }} />
          <main className="page is-settling">

            <section className="so-head">
              <span className="mask"><h1 className="so-title ink rise" data-text="Social">Social</h1></span>
              <p className="so-lede intro" style={{ '--d': '.25s' } as CSSProperties}>Share albums with the people you see most, or find public events happening near you.</p>
              <nav className="so-jump intro" style={{ '--d': '.35s' } as CSSProperties} aria-label="On this page">
                <a className="so-jump-item glass" href="#groups">
                  <span className="so-jump-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.8" cy="9.5" r="2.5" /><path d="M15.6 14.6c2.4-.2 4.3 1.3 4.9 4.4" /></svg></span>
                  <span><b>Groups</b><small>Share albums with the same people</small></span>
                </a>
                <a className="so-jump-item glass" href="#events">
                  <span className="so-jump-ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" /></svg></span>
                  <span><b>Events</b><small>Join public albums near you</small></span>
                </a>
              </nav>
            </section>

            {/* Everything waiting for an answer, in one place: group invites, event invitations, guests to let in, your own requests */}
            <section className="so-need" id="soNeed" aria-labelledby="soNeedTitle" hidden>
              <h2 className="gr-h2" id="soNeedTitle">Needs you <span className="so-count" id="soNeedCount"></span></h2>
              <div className="so-stack" aria-live="polite">
                <div className="so-stack" id="grInvites"></div>
                <div className="so-stack" id="eaInvites"></div>
                <div className="so-stack" id="eaWaiting"></div>
              </div>
            </section>

            <section className="so-sec" id="groups" aria-labelledby="soGroupsTitle">
              <div className="so-sec-head">
                <div>
                  <h2 className="so-h2" id="soGroupsTitle">Your groups</h2>
                  <p className="so-sec-lede">People you share albums with again and again. Everyone in a group sees every album shared with it, and can add their own photos.</p>
                </div>
                <button className="btn btn-dark" type="button" id="grNew">New group</button>
              </div>
              <p className="gr-status" id="grStatus" role="status"></p>
              <div className="gr-body" id="grBody" aria-label="Your groups" aria-busy="true">
                <div className="panel gr-loading" aria-hidden="true"></div>
              </div>
            </section>

            <section className="so-sec" id="events" aria-labelledby="soEventsTitle">
              <div className="so-sec-head ev-top">
                <div className="ev-top-copy">
                  <h2 className="so-h2" id="soEventsTitle">Events near you</h2>
                  <p className="so-sec-lede">Public albums happening around you. Open one to see its photos and join in.</p>
                </div>
                <div className="ev-actions">
                  <button className="btn btn-light" type="button" id="joinOpen">Join with a code</button>
                  <button className="btn btn-light" type="button" id="scanOpen" data-qr-scan="">Scan a QR code</button>
                  <a className="btn btn-light" href="/#how-it-works" data-create="" data-create-kind="event"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Create an event</a>
                </div>
              </div>
              <section className="ea-requests" id="admission-status" aria-live="polite" hidden><h3>Your join requests</h3><ul></ul></section>
              <div className="ev-scanbar glass is-fresh" role="group" aria-label="Look for events">
                <label className="ev-search">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
                  <input id="evSearch" type="text" autoComplete="off" spellCheck="false" placeholder="Search a town or place" aria-label="Search a town or place" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="evSuggest" />
                  <ul className="ev-suggest" id="evSuggest" role="listbox" aria-label="Places" hidden></ul>
                </label>
                <span className="ev-scanbar-sep" aria-hidden="true"></span>
                <div className="ev-reach" id="evRange" role="radiogroup" aria-label="How far to look">
                  <span className="ev-reach-pill" aria-hidden="true"></span>
                  <button type="button" role="radio" aria-checked="false" data-m="500" tabIndex={-1}>500 m</button>
                  <button type="button" role="radio" aria-checked="true" data-m="1000" tabIndex={0}>1 km</button>
                  <button type="button" role="radio" aria-checked="false" data-m="2000" tabIndex={-1}>2 km</button>
                  <button type="button" role="radio" aria-checked="false" data-m="5000" tabIndex={-1}>5 km</button>
                  <button type="button" role="radio" aria-checked="false" data-m="10000" tabIndex={-1}>10 km</button>
                </div>
                <span className="ev-go-wrap"><button className="btn btn-dark ev-go" type="button" id="evLocate">Scan nearby</button></span>
              </div>
              <div className="ev-body" aria-label="Events on the map and in a list">
                <div className="ev-mapbox">
                  <span className="ev-halo" aria-hidden="true"><i></i><b></b></span>
                  <div id="evMap" role="region" aria-label="Globe showing events near you"></div>
                  <button className="ev-map-scan" id="evMapScan" type="button"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>Scan to see events near you</button>
                  <p className="ev-map-note" id="evMapNote" hidden></p>
                </div>
                <div className="ev-side">
                  <div className="ev-side-head">
                    <p className="ev-status" id="evStatus" role="status"></p>
                    <label className="ev-notify" htmlFor="evNotify"><span>Alert me about events nearby</span><button className="acct-sw" type="button" role="switch" id="evNotify" aria-checked="false"></button></label>
                  </div>
                  <div className="ev-list" id="evList">
                    <div className="ev-empty ev-scan ev-scan--cta is-idle panel">
                      <span className="ev-radar" aria-hidden="true"><i></i><i></i><i></i><span className="ev-radar-pin"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.3" /></svg></span></span>
                      <h2>Scan to see the events near you</h2>
                      <p>Pick how far to look, then scan to see public events within <b data-range-label="">1 km</b>. Momento asks for your location first, and only uses it when you scan.</p>
                      <button className="btn btn-dark ev-scan-go" type="button" data-rescan=""><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 2v4M12 18v4M2 12h4M18 12h4" /></svg>Scan nearby</button>
                    </div>
                  </div>
                  <button className="ev-more glass" type="button" id="evMore" hidden></button>
                </div>
              </div>
            </section>

            {/* Only for people who host an event album: who gets in, the join deadline, and guests waiting to be let in */}
            <section className="so-sec" id="soHosting" aria-labelledby="soHostingTitle" hidden>
              <div className="so-sec-head">
                <div>
                  <h2 className="so-h2" id="soHostingTitle">Events you host <span className="ea-total" id="eaTotal"></span></h2>
                  <p className="so-sec-lede">Choose who gets in, set a join deadline, and let waiting guests in.</p>
                </div>
              </div>
              <div className="eh-list" id="joinedEvents" aria-live="polite"></div>
            </section>
            <div className="so-end" aria-hidden="true"></div>

        <dialog className="modal" id="joinModal" aria-labelledby="joinTitle">
          <form className="modal-card small" id="joinForm" noValidate>
            <button className="close" type="button" data-close="" aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            <h2 id="joinTitle" style={{ paddingRight: '2.5rem' } as CSSProperties}>Join an album</h2>
            <p className="modal-sub">Enter the 7-character code the host shared with you.</p>
            <div className="field"><span id="joinCodeLabel">Album code</span>
              <div className="otp" id="joinOtp" role="group" aria-labelledby="joinCodeLabel">
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 1 of 7" />
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 2 of 7" />
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 3 of 7" />
                <span className="otp-dash" aria-hidden="true"></span>
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 4 of 7" />
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 5 of 7" />
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 6 of 7" />
                <input type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck="false" placeholder="•" aria-label="Character 7 of 7" />
              </div>
              <input type="hidden" name="code" id="joinCode" />
            </div>
            <p className="note" id="joinNote" role="status"></p>
            <div className="modal-actions"><button className="btn btn-dark" type="submit" style={{ width: '100%' } as CSSProperties}>Join album</button></div>
            <button className="join-scan" type="button" id="joinScan">Or scan the host’s QR code</button>
          </form>
        </dialog>

            <dialog className="gd" id="grDrawer" aria-labelledby="grTitle">
              <div className="gd-card" id="grPanel"></div>
            </dialog>

            <dialog className="ev-sheet" id="evSheet" aria-labelledby="evSheetTitle">
              <div className="ev-card panel" id="evCard"></div>
            </dialog>

            <SiteFooter />
          </main>
        </div>
    </>
  );
}
