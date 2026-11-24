import type { CSSProperties } from 'react';

// Phones: the hero and the QR card are centred in the first screen by measuring them (home.js, fitHero). That used
// to happen only once the page's code had run, so the heading first painted high and then dropped ~70px into place.
// The same measurement now also runs here, while the page is still being read, before the first paint: home.js then
// sets the same values. (Keep the two in step.)
const FIT_HERO = `
(() => {
  if (innerWidth > 600) return;
  const stage = document.getElementById('stage'), card = document.getElementById('qrCard');
  const left = document.getElementById('heroLeft'), header = document.getElementById('header');
  if (!stage || !card || !left || !header) return;
  const head = header.offsetTop + header.offsetHeight + 8;   // (its layout box: not moved by its entrance animation)
  const h1 = left.offsetHeight, h2 = card.offsetHeight, gap = 28;
  const avail = stage.clientHeight - head - 16;
  const start = head + Math.max(0, (avail - (h1 + gap + h2)) / 2);
  stage.style.setProperty('--hero-top', start + 'px');
  if (h1 + gap + h2 <= avail) { stage.style.setProperty('--qr-top', (start + h1 + gap) + 'px'); stage.style.setProperty('--qr-ty', '0%'); }
})();
`;

export default function Hero() {
  return (
    <>
      <div className="story" id="home">
        {/* (its --hero-top / --qr-top are set by FIT_HERO below before React hydrates) */}
        <div className="stage" id="stage" suppressHydrationWarning>
          <div className="floaters floaters-back" aria-hidden="true"></div>

          <section className="hero-left" id="heroLeft">
            <h1 className="hero-title ink" data-text="Moments,&#10;kept.">Moments,<br />kept.</h1>
            <p className="hero-copy">Every photo from your event,<br />in one shared album.</p>

            <div className="hero-cta">
              <a className="btn btn-dark" href="#how-it-works" data-create="">Create an album</a>
              <a className="btn btn-pearl" href="events#join">Join with a code</a>
            </div>
          </section>

          {/* The QR code a guest would scan at the event; scanning brings out the album */}
          <div className="qr-card" id="qrCard" data-nosnippet="">
            <span className="qr-live" aria-hidden="true"><i></i>Live · <b id="qrLiveN">248</b> photos</span>
            {/* The QR is the print's photo; the white strip under it carries the caption and the button */}
            <div className="qr-photo">
              <div className="qr-frame">
                <span className="qr-finder" aria-hidden="true"></span>
                <div className="qr-code"><svg id="qrHero" viewBox="0 0 25 25" shapeRendering="crispEdges" aria-hidden="true"></svg></div>
                <span className="qr-beam" aria-hidden="true"></span>
                <div className="qr-found" role="status" aria-live="polite"><i><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></i><span>Album found</span></div>
              </div>
            </div>
            <div className="qr-strip">
              <div className="qr-event">Scan to join</div>
              <div className="qr-title">Amira &amp; Joel’s wedding</div>
              <button className="btn btn-dark" type="button" id="qrScan" data-qr-scan="">Scan the code</button>
            </div>
          </div>

          {/* Built by the script from ALBUM; hidden until the code is scanned. data-nosnippet: Google doesn't quote
               its sample captions in search results */}
          <div className="album" aria-label="Momento photo album" style={{ visibility: 'hidden' } as CSSProperties} data-nosnippet=""></div>

          <div className="page-arrows">
            <button className="pa glass" type="button" data-dir="-1" aria-label="Previous page"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
            <span className="pa-count" aria-live="polite">1 of 5</span>
            <button className="pa glass" type="button" data-dir="1" aria-label="Next page"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
          </div>

          <div className="floaters floaters-front" aria-hidden="true"></div>
        </div>
        <script dangerouslySetInnerHTML={{ __html: FIT_HERO }} suppressHydrationWarning />
      </div>
    </>
  );
}
