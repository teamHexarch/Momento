import NavWrap, { type NavCurrent } from './NavWrap';
import { MeSlot } from '../shell/AccountChip';

/**
 * The header of the inner pages (My albums, Social, Settings, Support): logo, nav, and the slot the account chip
 * is built in. The pages differ only in which nav item is the current page. (Home has its own header.)
 */
export default function SiteHeader({ current }: { current: NavCurrent }) {
  return (
    <>
      <header className="header" id="header">
        <a href="/" className="brand" aria-label="Momento, home">
          <svg className="glyph" aria-hidden="true"><use href="#glyph-album" /></svg>
          <svg className="brand-word" aria-hidden="true"><use href="#wordmark" /></svg>
        </a>
        <NavWrap current={current} />
        {/* The account chip and its menu */}
        <MeSlot />
      </header>
    </>
  );
}
