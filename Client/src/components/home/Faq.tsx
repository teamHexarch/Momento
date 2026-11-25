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
              <div className="qa-a"><p>No. Guests scan the event’s QR code or type its six-letter code, and they can start sharing straight away.</p></div>
            </div>
            <div className="qa">
              <button type="button" aria-expanded="false"><span>Who owns the photos?</span><i></i></button>
              <div className="qa-a"><p>The host does. Photos are kept safe in Momento’s private cloud, and everyone in the album can download them all as a .zip in one click, to keep on a phone, computer or their own cloud.</p></div>
            </div>
            <div className="qa">
              <button type="button" aria-expanded="false"><span>What if a guest is outside the sharing zone?</span><i></i></button>
              <div className="qa-a"><p>Momento shows them how far away they are and can let them know once they’re close enough to join.</p></div>
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
