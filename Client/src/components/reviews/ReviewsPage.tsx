import type { CSSProperties } from 'react';
import SiteFooter from '@/components/shared/SiteFooter';
import ReviewsBoard from './ReviewsBoard';

/** The Reviews page: what people say about Momento, and a place to add yours. Built from the Support page's parts. */
export default function ReviewsPage() {
  return (
    <div className="page-wrap" id="pageWrap">
      <div className="trail" id="trail" data-trail="" data-pad="10" data-avoid=".sp-head > *, .panel, .rv-listbar, .site-foot" aria-hidden="true"></div>
      <main className="page">
        <section className="sp-head">
          <span className="mask"><h1 className="sp-title ink rise" data-text="Reviews">Reviews</h1></span>
          <p className="sp-lede intro" style={{ '--d': '.3s' } as CSSProperties}>How Momento went at other people’s events. Used it at yours? Tell everyone how it went.</p>
        </section>
        <ReviewsBoard />
        <SiteFooter />
      </main>
    </div>
  );
}
