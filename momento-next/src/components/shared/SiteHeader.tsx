import NavWrap, { type NavCurrent } from './NavWrap';

/**
 * The header of the inner pages (My albums, Social, Settings, Support): logo, nav, and the slot the account chip
 * is built in. The pages differ only in which nav item is the current page. (Home has its own header.)
 */
export default function SiteHeader({ current }: { current: NavCurrent }) {
  return (
    <>
      <header className="header" id="header">
        <a href="index.html" className="brand" aria-label="Momento, home">
          <svg className="glyph" aria-hidden="true"><use href="#glyph-album" /></svg>
          <svg className="brand-word" aria-hidden="true"><use href="#wordmark" /></svg>
        </a>
        <NavWrap current={current} />
        {/* The account chip and its menu are built here by the shared script */}
        <div className="me-slot" data-acct-host="" data-acct-always="" data-acct-logout="index.html"></div>
      </header>
    </>
  );
}
