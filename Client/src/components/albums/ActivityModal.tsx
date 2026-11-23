export default function ActivityModal() {
  return (
    <>
      <dialog className="modal" id="activityModal" aria-labelledby="activityTitle">
        <div className="modal-card album-card activity-card">
          <header className="ab-head">
            <div className="ab-title">
              <h2 id="activityTitle">Just added</h2>
              <p className="modal-sub">New photos in your albums, newest first.</p>
            </div>
            <div className="ab-acts">
              <button className="ab-icon" type="button" data-close="" aria-label="Close" title="Close"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
            </div>
          </header>
          <div className="album-scroll"><div className="feed-list" id="feed"></div></div>
        </div>
      </dialog>
    </>
  );
}
