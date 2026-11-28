export default function Faq() {
  return (
    <>
      <section className="feat" id="faq">
        <div className="divider rise-in"><span className="divider-label glass">FAQ</span><span className="divider-line" aria-hidden="true"></span></div>
        <div className="panel faq-panel rise-in">
          <h2 className="section-title ink" data-text="Questions">Questions</h2>
          <span className="grow"></span>
          <div className="faq-list">
            <div className="qa">
              <button type="button" aria-expanded="false"><span>Do guests need an account?</span><i></i></button>
              <div className="qa-a"><p>Just a quick one: name, email and date of birth, or Continue with Google. There’s no app to download, so guests scan the QR code or type the six-letter code and start sharing in about a minute.</p></div>
            </div>
            <div className="qa">
              <button type="button" aria-expanded="false"><span>Who owns the photos?</span><i></i></button>
              <div className="qa-a"><p>The host does. Photos are kept safe in Momento’s private cloud, and everyone in the album can download them all as a .zip in one click, to keep on a phone, computer or their own cloud.</p></div>
            </div>
            <div className="qa">
              <button type="button" aria-expanded="false"><span>What if the host turns on the venue check?</span><i></i></button>
              <div className="qa-a"><p>Then guests can join only while they’re near the venue. Anyone too far away sees how far, and Momento can let them know once they’re close enough. Most events leave it off, so anyone with the code can join.</p></div>
            </div>
            <div className="qa">
              <button type="button" aria-expanded="false"><span>Does it work with real cameras?</span><i></i></button>
              <div className="qa-a"><p>Yes. Sony ARW, Canon CR3, iPhone HEIC and ProRAW files all upload; camera RAW files are kept as full-size, high-quality JPEGs.</p></div>
            </div>
            <div className="qa">
              <button type="button" aria-expanded="false"><span>Will it use up my mobile data?</span><i></i></button>
              <div className="qa-a"><p>Only if you let it. Turn on Wi-Fi only and uploads wait until you’re connected. Shares made offline resume on their own.</p></div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
