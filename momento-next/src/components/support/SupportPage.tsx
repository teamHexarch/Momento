import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';

export default function SupportPage() {
  return (
    <>
      <div className="page-wrap" id="pageWrap">
        <div className="trail" id="trail" data-trail="" data-pad="10" data-avoid=".sp-head > *, .panel, .site-foot" aria-hidden="true"></div>
        <main className="page">

          <section className="sp-head">
            <span className="mask"><h1 className="sp-title ink rise" data-text="How can we help?">How can we help?</h1></span>
            <p className="sp-lede intro" style={{ '--d': '.3s' } as CSSProperties}>Quick answers first. If you’re still stuck, send us a message and a person will reply within a day.</p>
          </section>

          <section className="s-group" style={{ '--d': '.25s' } as CSSProperties} aria-labelledby="g-faq">
            <h2 id="g-faq">Quick answers</h2>
            <div className="panel sp-faq">
              <div className="qa">
                <button type="button" aria-expanded="false"><span>How do guests join an album?</span><i></i></button>
                <div className="qa-a"><p>They point their phone camera at the host’s QR code and the album opens. Signing up lets them add their own photos.</p></div>
              </div>
              <div className="qa">
                <button type="button" aria-expanded="false"><span>Who can see the photos?</span><i></i></button>
                <div className="qa-a"><p>Only the people who joined the album. The host decides whether guests can see the gallery while the event is on.</p></div>
              </div>
              <div className="qa">
                <button type="button" aria-expanded="false"><span>How long does an album stay open?</span><i></i></button>
                <div className="qa-a"><p>Uploads and downloads stay open for a while after the event, then the album is kept as an archive. Download your photos before it closes.</p></div>
              </div>
              <div className="qa">
                <button type="button" aria-expanded="false"><span>Does it work with real cameras?</span><i></i></button>
                <div className="qa-a"><p>Yes. Sony ARW, Canon CR3, iPhone HEIC and ProRAW files upload as untouched originals, and camera files go first.</p></div>
              </div>
              <div className="qa">
                <button type="button" aria-expanded="false"><span>Can I remove a photo I added?</span><i></i></button>
                <div className="qa-a"><p>Yes. Open the album, choose your photo and pick Delete. You can only remove the photos you added yourself.</p></div>
              </div>
            </div>
          </section>

          <div className="sp-cols">
            <section className="s-group" style={{ '--d': '.31s' } as CSSProperties} aria-labelledby="g-msg" id="msgCard">
              <h2 id="g-msg">Send us a message</h2>
              <div className="panel s-list sp-card">
                <form id="supportForm" noValidate>
                  <div className="sp-pair">
                    <label className="acct-field"><span>Your name</span><input name="name" autoComplete="name" placeholder="For example Priya Shah" /></label>
                    <label className="acct-field"><span>Email</span><input name="email" type="email" autoComplete="email" inputMode="email" placeholder="name@example.com" /></label>
                  </div>
                  <span className="sp-label" id="topicLabel">What is it about?</span>
                  <div className="acct-seg sp-seg" id="topicSeg" role="radiogroup" aria-labelledby="topicLabel">
                    <span className="acct-seg-pill" aria-hidden="true"></span>
                    <button type="button" role="radio" aria-checked="true" data-topic="Joining an album">Joining</button>
                    <button type="button" role="radio" aria-checked="false" data-topic="Uploads">Uploads</button>
                    <button type="button" role="radio" aria-checked="false" data-topic="Something else">Other</button>
                  </div>
                  <label className="acct-field"><span>Your message</span><textarea name="message" placeholder="Tell us what happened and what you expected."></textarea></label>
                  <p className="sp-note" id="formNote" role="status"></p>
                  <button className="btn btn-dark btn-sm" type="submit">Send message</button>
                </form>
                <div className="sp-done" id="formDone" hidden>
                  <span className="sp-done-ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" /></svg></span>
                  <h3 id="doneTitle" tabIndex={-1}>Message sent</h3>
                  <p>We’ll reply to <b id="doneMail"></b> within a day. Check your spam folder if you don’t see it.</p>
                  <button className="btn btn-light btn-sm" type="button" id="sendAnother">Send another</button>
                </div>
              </div>
            </section>

            <section className="s-group" style={{ '--d': '.37s' } as CSSProperties} aria-labelledby="g-ways">
              <h2 id="g-ways">Other ways to reach us</h2>
              <div className="panel s-list">
                <a className="s-row" href="mailto:support@hexarch.org"><span className="s-chip" style={{ '--c': '#C6DEDA' } as CSSProperties}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" /></svg></span><span className="s-text"><b>Email support</b><small>support@hexarch.org</small></span><svg className="s-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></a>
                <button className="s-row" type="button" id="openHelp"><span className="s-chip" style={{ '--c': '#C9C0E2' } as CSSProperties}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.8M12 17h.01" /></svg></span><span className="s-text"><b>Help and support</b><small>Open the help window</small></span><svg className="s-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></button>
                <a className="s-row" href="settings.html"><span className="s-chip" style={{ '--c': '#EBDCCB' } as CSSProperties}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg></span><span className="s-text"><b>Your settings</b><small>Uploads, privacy and notifications</small></span><svg className="s-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></a>
                <div className="s-row is-plain"><span className="s-chip" style={{ '--c': '#E6CDD6' } as CSSProperties}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span><span className="s-text"><b>Reply time</b><small>Within a day, Monday to Friday</small></span></div>
              </div>
            </section>
          </div>

          <SiteFooter />
        </main>
      </div>
    </>
  );
}
