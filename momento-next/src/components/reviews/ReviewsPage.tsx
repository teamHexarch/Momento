import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';
import ReviewsBoard from './ReviewsBoard';

/** The Reviews page: private feedback for the Momento team, all out of 5 stars. Built from the Support page's parts. */
export default function ReviewsPage() {
  return (
    <div className="page-wrap" id="pageWrap">
      <div className="trail" id="trail" data-trail="" data-pad="10" data-avoid=".sp-head > *, .panel, .site-foot" aria-hidden="true"></div>
      <main className="page">
        <section className="sp-head">
          <span className="mask"><h1 className="sp-title ink rise" data-text="Reviews">Reviews</h1></span>
          <p className="sp-lede intro" style={{ '--d': '.3s' } as CSSProperties}>Used Momento at an event? Give it a few stars. Only the overall rating is needed, and only the Momento team sees your answers.</p>
        </section>
        <ReviewsBoard />
        <SiteFooter />
      </main>
    </div>
  );
}
