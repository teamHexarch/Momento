import { HomeAuthArea } from '../shell/AccountChip';

export default function Header() {
  return (
    <>
      <header className="header" id="header">
        <a href="#home" className="brand" aria-label="Momento, home">
          <svg className="glyph" aria-hidden="true"><use href="#glyph-album" /></svg>
          <svg className="brand-word" aria-hidden="true"><use href="#wordmark" /></svg>
        </a>
        <div className="nav-wrap" id="navWrap">
          <nav className="nav glass" aria-label="Main">
            <span className="nav-split active">
              <a href="#home" className="nav-item nav-home" aria-label="Home" aria-current="page"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.4 12 4l8 6.4V19a1.5 1.5 0 0 1-1.5 1.5H15v-5.2H9v5.2H5.5A1.5 1.5 0 0 1 4 19Z" /></svg><span className="nav-label">Home</span></a>
              <button className="nav-caret" type="button" aria-expanded="false" aria-controls="navMenu" aria-label="Show the sections of this page"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg></button>
            </span>
            <a href="albums" className="nav-item nav-albums" aria-label="My albums"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3.5" y="7" width="13.5" height="13" rx="2.2" /><path d="M7.5 3.8h10.3a2.7 2.7 0 0 1 2.7 2.7V16" /><path d="m3.8 17 3.7-3.7 3 3 1.8-1.8 4.4 4.4" /></svg><span className="nav-label">My albums</span></a>
            <a href="events" className="nav-item nav-social" aria-label="Social"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="16.8" cy="9.5" r="2.5" /><path d="M15.6 14.6c2.4-.2 4.3 1.3 4.9 4.4" /></svg><span className="nav-label">Social</span></a>
            <a href="settings" className="nav-item nav-settings" aria-label="Settings"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg><span className="nav-label">Settings</span></a>
          </nav>
          <div className="nav-menu glass" id="navMenu" aria-label="Sections on this page">
            <span className="menu-pill" aria-hidden="true"></span>
            <a href="#how-it-works" className="menu-item">How it works</a>
            <a href="#features" className="menu-item">Features</a>
            <a href="#faq" className="menu-item">FAQ</a>
            <span className="menu-hint">Hold and drag down the list to glide through the page</span>
          </div>
        </div>
        {/* Log in / Sign up, or the account chip once signed in */}
        <HomeAuthArea />
      </header>
    </>
  );
}
