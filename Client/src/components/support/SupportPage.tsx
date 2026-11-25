import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';
import { SupportFaq, SupportForm } from './SupportInteractive';

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
              </div>
            </section>
          </div>

          <SiteFooter />
        </main>
      </div>
    </>
  );
}
