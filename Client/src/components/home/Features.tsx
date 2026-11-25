export default function Features() {
  return (
    <>
      <section className="feat" id="features">
        <div className="divider rise-in"><span className="divider-label glass">Features</span><span className="divider-line" aria-hidden="true"></span></div>
        <div className="panel zone-panel rise-in">
          <div className="zone-copy">
            <h2 className="section-title ink" data-text="Only the people&#10;who were there">Only the people<br />who were there</h2>
            <p className="section-lede">Every Momento album has a sharing zone. Guests can join only while they’re inside it, so a wedding album never fills with strangers’ photos.</p>
            <span className="grow"></span>
            <div className="zone-ctrl">
              <div className="zone-ctrl-top"><label htmlFor="zoneR">Sharing zone</label><output id="zoneOut" htmlFor="zoneR">150 m</output></div>
              <input type="range" id="zoneR" min="0" max="100" defaultValue="40" />
              <p className="zone-count"><b id="zoneIn">4</b> of <span id="zoneAll">9</span> guests can join</p>
            </div>
          </div>
          <div className="zone-map" id="zoneMap" aria-hidden="true">
            <svg className="zone-streets" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice">
              <rect x="250" y="-20" width="190" height="120" rx="40" fill="#E6CDD6" opacity=".55" />
              <path d="M-20 300 Q 140 250 240 315 T 430 290" stroke="#6F9896" strokeOpacity=".35" strokeWidth="22" fill="none" />
              <g stroke="#fff" strokeWidth="9" fill="none" strokeLinecap="round"><path d="M0 120 H400" /><path d="M150 0 V400" /><path d="M310 0 L260 400" /><path d="M0 210 L400 190" /></g>
              <g stroke="#fff" strokeWidth="3.5" fill="none" opacity=".8"><path d="M70 0 V400" /><path d="M0 60 H400" /><path d="M0 360 H400" /><path d="M360 0 V400" /></g>
            </svg>
            <span className="zone-ring"></span>
            <span className="zone-ping"></span>
            <div className="zone-guests"></div>
            <svg className="zone-pin" viewBox="0 0 24 24" fill="#2E2C3A" stroke="#fff" strokeWidth="1.6"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.4" fill="#fff" stroke="none" /></svg>
          </div>
        </div>

        <div className="panel feat-list rise-in">
          <div className="feat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.8" cy="9.5" r="2.5" /><path d="M15.6 14.6c2.4-.2 4.3 1.3 4.9 4.4" /></svg>
            <h3>Your people, in one place</h3>
            <p>Start a group for the friends you share with most. Everyone in it sees every album shared with it, and new people join with an invite link, QR code or album code.</p>
          </div>
          <div className="feat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><path d="M12 12 17.5 6.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
            <h3>Events near you</h3>
            <p>Scan the map for public events happening around you, or search any town. Turn on alerts and Momento tells you when one starts nearby.</p>
          </div>
          <div className="feat-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg>
            <h3>Keep the ones you love</h3>
            <p>Bookmark your favourite photos and save albums you want to come back to. They all wait on the Bookmarked tab in My albums.</p>
          </div>
        </div>

        {/* Full quality: drag to compare a chat-app copy with the original file */}
        <div className="panel quality-panel rise-in" id="quality">
          <div className="qc" id="qc">
            <img className="qc-orig" data-p="8" data-w="900" alt="A photo kept at full quality" />
            <img className="qc-chat" data-p="8" data-w="36" alt="" aria-hidden="true" />
            <span className="qc-tag is-left">Chat app · 0.3 MB</span>
            <span className="qc-tag is-right">Momento · 24.6 MB</span>
            <span className="qc-line" aria-hidden="true"><span className="qc-knob"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 7 4 12l4.5 5M15.5 7 20 12l-4.5 5" /></svg></span></span>
            <input className="qc-range" id="qcRange" type="range" min="0" max="100" defaultValue="50" aria-label="Compare the chat-app copy with the original" />
          </div>
          <div className="quality-copy">
            <h2 className="section-title ink" data-text="Every pixel,&#10;as it was shot">Every pixel,<br />as it was shot</h2>
            <p className="section-lede">Chat apps shrink your photos to save space. Momento keeps your photos at full quality, so the album looks as good as the camera that took it.</p>
            <span className="grow"></span>
            <div className="qc-files">
              <b>Full-quality photos</b>
              <ul>
                <li>ARW<small>Sony</small></li>
                <li>CR3<small>Canon</small></li>
                <li>HEIC<small>iPhone</small></li>
                <li>ProRAW<small>iPhone Pro</small></li>
              </ul>
              <p>Camera RAW files are kept as full-size, high-quality JPEGs.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
