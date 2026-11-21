export default function BinModal() {
  return (
    <>
      <dialog className="modal" id="binModal" aria-labelledby="binTitle">
        <div className="modal-card album-card bin-card">
          <header className="ab-head" id="binHead">
            <div className="ab-title">
              <h2 id="binTitle">Recently deleted</h2>
              <p className="modal-sub" id="binSub"></p>
            </div>
            <div className="ab-acts">
              <button className="ab-btn" type="button" id="binSelect">Select</button>
              <button className="ab-icon" type="button" data-close="" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
          </header>
          <header className="ab-head ab-selhead" id="binSelHead" hidden>
            <button className="ab-btn" type="button" id="binCancel">Cancel</button>
            <span className="ab-count" id="binCount" aria-live="polite">Select photos</span>
            <button className="ab-btn" type="button" id="binAll">Select all</button>
          </header>
          <div className="bin-seg" role="tablist" aria-label="What to show">
            <button type="button" role="tab" id="binTabDeleted" data-tab="deleted" aria-selected="true">Deleted<small></small></button>
            <button type="button" role="tab" id="binTabHidden" data-tab="hidden" aria-selected="false">Hidden by you<small></small></button>
          </div>
          <div className="album-scroll" id="binScroll">
            <div id="binBody"></div>
            <div className="album-empty" id="binEmpty" hidden><b></b><span></span></div>
          </div>
          <footer className="ab-bar" id="binBar"></footer>
          <footer className="ab-bar ab-selbar" id="binSelBar" hidden></footer>
          <div className="bin-peek" id="binPeek" hidden>
            <img id="binPeekImg" alt="" />
            <div className="bin-peek-bar" id="binPeekBar"></div>
          </div>
        </div>
      </dialog>
    </>
  );
}
