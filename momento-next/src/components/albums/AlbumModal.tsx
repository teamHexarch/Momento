export default function AlbumModal() {
  return (
    <>
      <dialog className="modal" id="albumModal" aria-labelledby="albumTitle">
        <div className="modal-card album-card">
          <header className="ab-head" id="abHead">
            <div className="ab-title">
              <h2 id="albumTitle"></h2>
              <p className="modal-sub" id="albumSub"></p>
              <p className="album-stats"><span id="albumStats"></span><span className="album-open" id="albumWindow" hidden></span></p>
            </div>
            <div className="ab-acts">
              <button className="ab-btn" type="button" id="abSelect">Select</button>
              <button className="ab-icon ab-bell" type="button" id="abBell" hidden aria-haspopup="dialog" aria-expanded="false" aria-controls="abPulse" aria-label="Activity" title="Activity"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7.5 2 7.5H4S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg><span className="ab-pip" id="abBellPip" hidden aria-hidden="true">0</span></button>
              <button className="ab-icon" type="button" id="albumSave" aria-pressed="false" title="Save album"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg><span className="sr">Save</span></button>
              <button className="ab-icon" type="button" id="abMore" aria-haspopup="menu" aria-expanded="false" aria-controls="abMenu" aria-label="More options" title="More options"><svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg></button>
              <button className="ab-icon" type="button" data-close="" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
            <div className="ab-menu" id="abMenu" role="menu" aria-label="Album options" hidden>
              <button className="ab-item" role="menuitem" type="button" id="abSettings" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>Album settings</button>
              <button className="ab-item" role="menuitem" type="button" id="abShare" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>Share album</button>
              <button className="ab-item" role="menuitem" type="button" id="albumDownload"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Download all</button>
              <button className="ab-item" role="menuitem" type="button" id="abBinHere"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg>Recently deleted<small id="abBinCount"></small></button>
              <button className="ab-item" role="menuitem" type="button" id="albumUnhide" hidden><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-10-8-10-8a17 17 0 0 1 4.1-5.4M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" /></svg><span>Hidden by you</span></button>
              <hr className="ab-sep" />
              <button className="ab-item album-remove" role="menuitem" type="button" id="albumRemove">Delete album</button>
            </div>
            {/* Public albums, host only: who joined and what was added. Quiet by design: a count on the bell, never a pop-up */}
            <section className="ab-pulse" id="abPulse" role="dialog" aria-label="Album activity" tabIndex={-1} hidden>
              <header className="pulse-head"><b>Activity</b><button className="pulse-link" type="button" id="pulseRead">Mark all read</button></header>
              <div className="pulse-list" id="pulseList" aria-live="polite"></div>
              <footer className="pulse-foot"><span>Guests join without asking.</span><button className="pulse-link" type="button" id="pulseMute">Mute this album</button></footer>
            </section>
          </header>
          <header className="ab-head ab-selhead" id="abSelHead" hidden>
            <button className="ab-btn" type="button" id="abCancel">Cancel</button>
            <span className="ab-count" id="abCount" aria-live="polite">Select photos</span>
            <button className="ab-btn" type="button" id="abAll">Select all</button>
          </header>
          <div className="album-scroll" id="albumScroll">
            <div className="album-code" id="albumCode" hidden>
              <small>Album code</small><b id="albumCodeText"></b>
              <span className="album-share">
                <button className="icon" type="button" id="albumCodeCopy" aria-label="Copy code" title="Copy code"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></svg></button>
                <button className="icon" type="button" id="albumLink" aria-label="Copy link" title="Copy link"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg></button>
                <button className="icon" type="button" id="albumQr" aria-label="Show QR code" title="Show QR code"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><path d="M14 14h2v2M20 14v6h-6" /></svg></button>
              </span>
            </div>
            <div className="ab-grid" id="thumbs" role="group" aria-label="Photos"></div>
            {/* More photos below: a nudge to scroll, gone once you do */}
            <button className="ab-more" type="button" id="abScrollHint" hidden><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 10l5 5 5-5" /></svg><span>Scroll to see more photos</span></button>
            <div className="album-empty" id="albumEmpty" hidden>
              <b>No photos yet</b>
              <span id="albumEmptyText"></span>
            </div>
          </div>
          <input type="file" id="albumFiles" accept="image/*" multiple hidden />
          <div className="upload" id="upload" hidden>
            <div className="upload-top"><span id="uploadLabel">Uploading</span><span id="uploadPct">0%</span></div>
            <div className="upload-track" id="uploadTrack" role="progressbar" aria-labelledby="uploadLabel" aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}><i id="uploadFill"></i></div>
          </div>
          <p className="note" id="albumNote" role="status"></p>
          <footer className="ab-bar" id="abBar">
            <button className="btn btn-dark" type="button" id="albumAdd" title="Up to 50 MB a photo. Camera RAW files can be bigger.">Add photos</button>
            <button className="btn btn-light btn-icon" type="button" id="albumCamera" aria-label="Take a photo" title="Take a photo"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg></button>
          </footer>
          <footer className="ab-bar ab-selbar" id="abSelBar" hidden>
            <button className="ab-tool" type="button" id="abDl"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg><span>Download</span></button>
            <button className="ab-tool" type="button" id="abHide"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-10-8-10-8a17 17 0 0 1 4.1-5.4M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" /></svg><span>Hide</span></button>
            <button className="ab-tool is-danger" type="button" id="abDel"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg><span>Delete</span></button>
          </footer>
        </div>
      </dialog>
    </>
  );
}
