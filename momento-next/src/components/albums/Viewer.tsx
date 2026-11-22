export default function Viewer() {
  return (
    <>
      <dialog className="viewer" id="viewer" aria-label="Photo at full size">
        {/* The dark behind the photo: its own layer, so it can fade while the photo moves (open, close, swipe down) */}
        <div className="vw-bg" id="vwBg" aria-hidden="true"><img className="vw-amb" alt="" /><img className="vw-amb" alt="" /></div>
        <div className="vw-top">
          <p className="vw-count" id="vwCount"></p>
          <div className="vw-tools">
            {/* Zoom: out, the level (press it to fit the photo again), in. Phones pinch instead */}
            <div className="vw-zoom" role="group" aria-label="Zoom">
              <button className="vw-btn" type="button" id="vwZoomOut" aria-label="Zoom out" title="Zoom out (−)" disabled><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
              <button className="vw-btn vw-zoom-level" type="button" id="vwZoomFit" aria-label="Fit the photo to the screen" title="Fit to screen (0)">Fit</button>
              <button className="vw-btn" type="button" id="vwZoomIn" aria-label="Zoom in" title="Zoom in (+)"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
            </div>
            <button className="vw-btn vw-mark" type="button" id="vwMark" aria-pressed="false" aria-label="Bookmark this photo" title="Bookmark"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg></button>
            <button className="vw-btn" type="button" id="vwHide" aria-label="Hide from my view" title="Hide from my view" hidden><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-10-8-10-8a17 17 0 0 1 4.1-5.4M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20" /></svg></button><button className="vw-btn" type="button" id="vwReport" aria-label="Report this photo" title="Report this photo" hidden><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg></button>
            <button className="vw-btn" type="button" id="vwDownload" aria-label="Download this photo" title="Download"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14" /></svg></button>
            <button className="vw-btn vw-danger" type="button" id="vwDel" aria-label="Delete this photo" title="Delete" hidden><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg></button>
            <button className="vw-btn" type="button" id="vwClose" aria-label="Close full size" title="Close (Esc)"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
          </div>
        </div>
        {/* Swipe left or right: the photos either side ride along with your finger */}
        <div className="vw-stage" id="vwStage"><img className="vw-side" id="vwPrevImg" alt="" draggable="false" aria-hidden="true" /><img id="vwImg" alt="" draggable="false" /><img className="vw-side" id="vwNextImg" alt="" draggable="false" aria-hidden="true" /></div>
        {/* Double-tap (or double-click) a photo: a heart pops where you tapped */}
        <span className="vw-burst" id="vwBurst" aria-hidden="true"></span>
        <button className="vw-nav prev" type="button" id="vwPrev" aria-label="Previous photo"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg></button>
        <button className="vw-nav next" type="button" id="vwNext" aria-label="Next photo"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg></button>
        {/* Along the bottom: React (opens the emoji above it), everyone's reactions (tap one to see who),
             and a star when it's the album's cover */}
        {/* Every photo in a strip: where you are in the album, and a tap to jump anywhere */}
        <div className="vw-film" id="vwFilm" role="group" aria-label="All photos"></div>
        <p className="vw-swipe" id="vwSwipe" aria-hidden="true" hidden><span className="vw-swipe-ic"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M14 7l-5 5 5 5" /></svg><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M10 7l5 5-5 5" /></svg></span>Swipe to see more photos</p>
        <div className="vw-foot" id="vwFoot">
          <button className="vw-btn vw-react" type="button" id="vwReact" aria-haspopup="dialog" aria-expanded="false" aria-controls="vwPicker"><span className="vw-face" id="vwFace"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M8.6 14.2c.8 1.2 2 1.9 3.4 1.9s2.6-.7 3.4-1.9" /><path d="M9.2 9.6h.01M14.8 9.6h.01" strokeWidth="2.6" /></svg></span><span className="vw-react-label">React</span></button>
          {/* Everyone's reactions (tap one to see who) and a star when it's the album's cover; scrolls sideways on a phone */}
          <div className="vw-chips" id="vwChips">
            <span className="pb-cover" id="pbCover" hidden><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 3.8l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8Z" /></svg>Album cover</span>
            <div className="pb-tally" id="pbTally"></div>
          </div>
        </div>
        {/* Choose a reaction: search, then every emoji in groups. A popover on a computer, a sheet from the bottom on a phone */}
        <div className="rx-picker vw-picker" id="vwPicker" role="dialog" aria-label="Choose a reaction" tabIndex={-1} hidden>
          <div className="rx-grab" aria-hidden="true"><i></i></div>
          <label className="rx-search"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg><input type="search" id="rxSearch" placeholder="Search emoji" autoComplete="off" autoCapitalize="off" spellCheck="false" enterKeyHint="search" aria-label="Search emoji" aria-controls="vwEmoji" /></label>
          <div className="rx-scroll" id="vwEmoji"></div>
          <p className="rx-none" id="rxNone" role="status" hidden></p>
        </div>
        <div className="rx-who" id="pbWho" role="dialog" aria-label="Who reacted" hidden><div className="rx-grab" aria-hidden="true"><i></i></div><div className="rx-who-tabs" id="pbWhoTabs"></div><ul className="rx-who-list" id="pbWhoList" aria-live="polite"></ul></div>
        <p className="vw-hint" id="vwHint">Click to zoom in. Double-click to react with a ❤️</p>
      </dialog>
    </>
  );
}
