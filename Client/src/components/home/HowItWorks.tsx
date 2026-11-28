import type { CSSProperties } from 'react';

export default function HowItWorks() {
  return (
    <>
      <section className="hiw" id="how-it-works">
        <div className="hiw-head">
          <h2 className="section-title ink" data-text="How it works">How it works</h2>
          <p className="section-lede">From the first photo to the album you keep, in five steps.</p>
          <span className="grow"></span>
        </div>
        <ol className="hiw-steps">
          <li className="hiw-card rise-in is-on" style={{ '--i': '0' } as CSSProperties}>
            <button type="button" className="panel hiw-btn" data-i="0" aria-current="step">
              <span className="hiw-art art-map" aria-hidden="true">
                <svg viewBox="0 0 320 172" preserveAspectRatio="xMidYMid slice">
                  <rect x="214" y="-12" width="130" height="72" rx="26" fill="#E6CDD6" opacity=".6" />
                  <rect x="-20" y="112" width="96" height="80" rx="24" fill="#D9D0EA" opacity=".55" />
                  <path d="M-10 146 Q 100 112 182 144 T 340 126" stroke="#6F9896" strokeOpacity=".4" strokeWidth="16" fill="none" />
                  <g stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round"><path d="M0 48 H320" /><path d="M112 0 V172" /><path d="M244 0 L204 172" /><path d="M0 96 L320 84" /></g>
                </svg>
                <span className="art-zone"></span>
                <svg className="art-pin" viewBox="0 0 24 24" fill="#2E2C3A" stroke="#fff" strokeWidth="1.6"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" fill="#fff" stroke="none" /></svg>
                <span className="art-chip">Rooftop Birthday</span>
                <span className="art-tag">150 m zone</span>
              </span>
              <span className="hiw-top"><span className="hiw-no">01</span><b className="hiw-title">Create the event</b></span>
              <span className="hiw-desc">Name it, pick the date, and choose where the photos are saved. Add a venue check if only the people there should join.</span>
              <span className="step-timer" aria-hidden="true"></span>
            </button>
          </li>
          <li className="hiw-card rise-in" style={{ '--i': '1' } as CSSProperties}>
            <button type="button" className="panel hiw-btn" data-i="1">
              <span className="hiw-art art-code" aria-hidden="true">
                <span className="art-qr"><svg id="qrStep" viewBox="0 0 25 25" shapeRendering="crispEdges"></svg><span className="art-scan"></span></span>
                <span className="art-side">
                  <small>Or type the code</small>
                  <span className="art-letters"><i style={{ '--k': '0' } as CSSProperties}>R</i><i style={{ '--k': '1' } as CSSProperties}>F</i><i style={{ '--k': '2' } as CSSProperties}>T</i><i style={{ '--k': '3' } as CSSProperties}>8</i><i style={{ '--k': '4' } as CSSProperties}>2</i><i style={{ '--k': '5' } as CSSProperties}>9</i></span>
                  <span className="art-faces"><img data-p="2" data-w="60" alt="" /><img data-p="12" data-w="60" alt="" /><img data-p="13" data-w="60" alt="" /><em>48 joined</em></span>
                </span>
              </span>
              <span className="hiw-top"><span className="hiw-no">02</span><b className="hiw-title">Put the code out</b></span>
              <span className="hiw-desc">Momento makes a QR code and a six-letter code. Print it, show it on a screen, or send the link.</span>
              <span className="step-timer" aria-hidden="true"></span>
            </button>
          </li>
          <li className="hiw-card rise-in" style={{ '--i': '2' } as CSSProperties}>
            <button type="button" className="panel hiw-btn" data-i="2">
              <span className="hiw-art art-radar" aria-hidden="true">
                <span className="art-rg" style={{ '--s': '56px' } as CSSProperties}></span><span className="art-rg zone" style={{ '--s': '116px' } as CSSProperties}></span><span className="art-rg" style={{ '--s': '176px' } as CSSProperties}></span>
                <span className="art-sweep"></span>
                <span className="art-me"></span>
                <span className="art-blip in" style={{ '--x': '-44px', '--y': '-26px' } as CSSProperties}><img data-p="7" data-w="80" alt="" /><small>40 m · in</small></span>
                <span className="art-blip far" style={{ '--x': '84px', '--y': '30px' } as CSSProperties}><img data-p="5" data-w="80" alt="" /><small>180 m out</small></span>
                <span className="art-chip">1 album in range</span>
              </span>
              <span className="hiw-top"><span className="hiw-no">03</span><b className="hiw-title">Guests scan and join</b></span>
              <span className="hiw-desc">One scan and no app to download. A quick sign-up, or Continue with Google, and they’re in.</span>
              <span className="step-timer" aria-hidden="true"></span>
            </button>
          </li>
          <li className="hiw-card rise-in" style={{ '--i': '3' } as CSSProperties}>
            <button type="button" className="panel hiw-btn" data-i="3">
              <span className="hiw-art art-up" aria-hidden="true">
                <span className="art-row"><img data-p="8" data-w="80" alt="" /><span><b>DSC04812.ARW</b><small>Sony α7 IV</small><i style={{ '--d': '0s', '--p': '.8' } as CSSProperties}></i></span></span>
                <span className="art-row"><img data-p="13" data-w="80" alt="" /><span><b>_MG_0420.CR3</b><small>Canon R6 II</small><i style={{ '--d': '.6s', '--p': '.5' } as CSSProperties}></i></span></span>
                <span className="art-row"><img data-p="2" data-w="80" alt="" /><span><b>IMG_2291.HEIC</b><small>iPhone 17 Pro</small><i style={{ '--d': '1.2s', '--p': '.25' } as CSSProperties}></i></span></span>
              </span>
              <span className="hiw-top"><span className="hiw-no">04</span><b className="hiw-title">Everyone shares</b></span>
              <span className="hiw-desc">Guests share straight from their Photos app, from phones and cameras alike.</span>
              <span className="step-timer" aria-hidden="true"></span>
            </button>
          </li>
          <li className="hiw-card rise-in" style={{ '--i': '4' } as CSSProperties}>
            <button type="button" className="panel hiw-btn" data-i="4">
              <span className="hiw-art art-album" aria-hidden="true">
                <span className="art-win" style={{ '--x': '4%', '--y': '8px', '--r': '-6deg', '--d': '0s' } as CSSProperties}><span className="art-pics"><img data-p="8" data-w="160" alt="" /><img data-p="7" data-w="80" alt="" /><img data-p="4" data-w="80" alt="" /></span><b>Sony α7 IV</b><small>86 photos</small></span>
                <span className="art-win" style={{ '--x': '31%', '--y': '24px', '--r': '3deg', '--d': '-1.5s' } as CSSProperties}><span className="art-pics"><img data-p="9" data-w="160" alt="" /><img data-p="11" data-w="80" alt="" /><img data-p="5" data-w="80" alt="" /></span><b>Canon R6 II</b><small>40 photos</small></span>
                <span className="art-win" style={{ '--x': '57%', '--y': '12px', '--r': '-2deg', '--d': '-3s' } as CSSProperties}><span className="art-pics"><img data-p="2" data-w="160" alt="" /><img data-p="12" data-w="80" alt="" /><img data-p="13" data-w="80" alt="" /></span><b>iPhone 17 Pro</b><small>214 photos</small></span>
                <span className="art-saved">340 photos saved</span>
              </span>
              <span className="hiw-top"><span className="hiw-no">05</span><b className="hiw-title">It all lands in one album</b></span>
              <span className="hiw-desc">Full quality, grouped by camera and phone, kept in Momento’s private cloud. Yours to download, print or relive.</span>
              <span className="step-timer" aria-hidden="true"></span>
            </button>
          </li>
        </ol>
      </section>
    </>
  );
}
