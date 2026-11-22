import Intro from '@/components/home/Intro';
import Backdrop from '@/components/shared/Backdrop';
import SvgSprite from '@/components/shared/SvgSprite';
import Header from '@/components/home/Header';
import AuthDialog from '@/components/home/AuthDialog';
import Hero from '@/components/home/Hero';
import HowItWorks from '@/components/home/HowItWorks';
import Features from '@/components/home/Features';
import Faq from '@/components/home/Faq';
import LegacyScripts from '@/legacy/LegacyScripts';
import SiteFooter from '@/components/shared/SiteFooter';
import Toaster from '@/components/shared/Toaster';
import ThemeProvider from '@/components/shared/ThemeProvider';
import AccountProvider from '@/components/shared/AccountProvider';
import Shell from '@/components/shell/Shell';

// Page behaviour (silk background, album, intro, auth, footer...) is the original code, run in the original order:
// the five inline blocks of index.html first, then the shared scripts that were `defer`red.
const SCRIPTS = [
  '/legacy/home-1.js',
  '/legacy/home-2.js',
  '/legacy/home-3.js',
  '/legacy/home-4.js',
  '/assets/extras.js',
  '/assets/crop.js',
  '/assets/inbox.js',
  '/assets/pickers.js',
  '/assets/nearby.js',
  '/assets/qr.js',
  '/assets/album-settings.js',
  '/assets/event.js',
];

export default function HomePage() {
  return (
    <ThemeProvider>
    <AccountProvider>
      <Intro />
      <Backdrop />
      <SvgSprite />
      <Header />
      <AuthDialog />

      <div className="page-wrap" id="pageWrap">
        <div className="trail" id="trail" data-trail="" data-avoid=".stage, .divider, .site-foot" aria-hidden="true"></div>

        {/* The whole page, from the hero to the questions, is the main landmark (display: contents keeps the layout) */}
        <main className="home-main">
          <Hero />
          <HowItWorks />
          <Features />
          <Faq />
        </main>

        <SiteFooter home />
      </div>

      <Shell trailFromMainLoop />
      <Toaster />
      <LegacyScripts scripts={SCRIPTS} />
    </AccountProvider>
    </ThemeProvider>
  );
}
