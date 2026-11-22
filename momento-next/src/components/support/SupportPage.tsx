import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';
import { HelpRow, SupportFaq, SupportForm } from './SupportInteractive';

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
            <SupportFaq />
          </section>

          <div className="sp-cols">
            <section className="s-group" style={{ '--d': '.31s' } as CSSProperties} aria-labelledby="g-msg" id="msgCard">
              <h2 id="g-msg">Send us a message</h2>
              <SupportForm />
            </section>

            <section className="s-group" style={{ '--d': '.37s' } as CSSProperties} aria-labelledby="g-ways">
              <h2 id="g-ways">Other ways to reach us</h2>
              <div className="panel s-list">
                <a className="s-row" href="mailto:support@hexarch.org"><span className="s-chip" style={{ '--c': '#C6DEDA' } as CSSProperties}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 7.5 7.5 5.5 7.5-5.5" /></svg></span><span className="s-text"><b>Email support</b><small>support@hexarch.org</small></span><svg className="s-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></a>
                <HelpRow><span className="s-chip" style={{ '--c': '#C9C0E2' } as CSSProperties}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.8c0 1.7-2.4 2.1-2.4 3.8M12 17h.01" /></svg></span><span className="s-text"><b>Help and support</b><small>Open the help window</small></span><svg className="s-go" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg></HelpRow>
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
