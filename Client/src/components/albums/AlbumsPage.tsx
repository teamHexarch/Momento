import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';

export default function AlbumsPage() {
  return (
    <>
      <div className="page-wrap" id="pageWrap">
        <main className="page">

          <section className="hero">
            <div>
              <span className="mask"><h1 className="title ink rise" data-text="My albums">My albums</h1></span>
              {/* (in the page from the start, so the line is already there: filling it later pushed everything below down) */}
              <p className="lede intro" id="lede" style={{ '--d': '.3s' } as CSSProperties}>Loading your albums…</p>
              <div className="hero-acts intro" style={{ '--d': '.4s' } as CSSProperties}>
                <button className="btn btn-dark" type="button" data-create=""><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>New album</button>
                <a className="btn btn-light" href="events#join"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" /><path d="M10 16l4-4-4-4M14 12H4" /></svg>Join an album</a>
              </div>
            </div>
            {/* Starts as its placeholder (the same markup albums.js gives it), so the hero is its full height from the first
                paint: empty, the card had no height and everything below moved down when it was filled */}
            <article className="live panel intro is-pending" id="live" style={{ '--d': '.5s' } as CSSProperties} aria-labelledby="liveTitle">
              <div className="live-media" aria-hidden="true"></div>
              <div className="live-actions" aria-hidden="true"><span className="btn live-ghost"></span><span className="btn live-ghost"></span></div>
            </article>
          </section>

          <section className="pulse" aria-label="What's happening">
            <div className="todo panel" aria-labelledby="todoLabel">
              <div className="head"><span className="label glass" id="todoLabel">Waiting on you</span><span className="rule" aria-hidden="true"></span></div>
              <ul className="todo-list" id="todo"><li className="todo-row todo-ghost" aria-hidden="true"></li><li className="todo-row todo-ghost" aria-hidden="true"></li></ul>
            </div>
          </section>

          <section aria-label="All your albums">
            <div className="tools glass">
              <div className="tabs" role="tablist" aria-label="Show albums">
                <span className="tab-pill" aria-hidden="true"></span>
                <button className="tab" role="tab" type="button" data-filter="all" aria-selected="true">All <small></small></button>
                <button className="tab" role="tab" type="button" data-filter="host" aria-selected="false">Hosting <small></small></button>
                <button className="tab" role="tab" type="button" data-filter="guest" aria-selected="false">Joined <small></small></button>
                <button className="tab" role="tab" type="button" data-filter="group" aria-selected="false">Groups <small></small></button>
                <button className="tab" role="tab" type="button" data-filter="liked" aria-selected="false" title="Bookmarked"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" /></svg><span className="tab-label">Bookmarked</span></button>
              </div>
              <div className="tools-end">
                <label className="search">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
                  <input type="search" id="search" placeholder="Find an album or place" aria-label="Find an album or place" />
                </label>
                <button className="tool-icon" type="button" id="activityOpen" aria-label="Just added" title="Just added"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="6" width="14" height="14" rx="2.5" /><path d="M7 3h11a3 3 0 0 1 3 3v11M3 16l4-4 4 4 3-3 3 3" /></svg><span className="tool-dot" id="activityDot" hidden></span></button>
                <button className="tool-icon" type="button" id="binOpen" aria-label="Recently deleted" title="Recently deleted"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></svg><span className="tool-badge" id="binBadge" hidden>0</span></button>
              </div>
            </div>
            <div id="years" className="is-loading"></div>
            {/* Stand-in cards while the albums load (shown only while #years is loading and empty: albums.css) */}
            <div className="years-ghost" aria-hidden="true">
              <span className="ghost-head"></span>
              <div className="grid">{[0, 1, 2, 3, 4, 5].map((i) => <span className="ghost-card" key={i}><i></i><b></b><b></b></span>)}</div>
            </div>
            {/* Bookmarked: albums you saved, and photos you bookmarked, from all your albums (the filter is still called "liked" in the code) */}
            <div id="likedView" hidden>
              <section className="lk-block" id="lkAlbumsBlock" aria-labelledby="lkAlbumsTitle" hidden>
                <div className="lk-head">
                  <h2 className="lk-title" id="lkAlbumsTitle">Saved albums</h2>
                  <p className="lk-meta" id="lkAlbumsMeta"></p>
                </div>
                <div className="grid" id="lkAlbums"></div>
              </section>
              <section className="lk-block" id="lkPhotosBlock" aria-labelledby="lkPhotosTitle" hidden>
                <div className="lk-head">
                  <h2 className="lk-title" id="lkPhotosTitle">Bookmarked photos</h2>
                  <p className="lk-meta" id="lkPhotosMeta"></p>
                </div>
                <div className="lk-grid" id="lkPhotos"></div>
              </section>
              <div className="empty panel" id="lkEmpty" hidden>
                <b id="lkEmptyTitle">Nothing bookmarked yet</b>
                <span id="lkEmptyText">Bookmark a photo while you look at it full size, or save an album with its bookmark, and it shows up here.</span>
              </div>
            </div>
            <div className="empty panel" id="empty" hidden>
              <b id="emptyTitle">No albums match</b>
              <span id="emptyHint">Try another name or place, or clear the search.</span>
              <button className="btn btn-light" type="button" id="clearSearch">Clear search</button>
            </div>
          </section>

          <SiteFooter />
        </main>
      </div>
    </>
  );
}
