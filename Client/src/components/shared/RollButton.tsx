'use client';

import { useRef } from 'react';

type Common = { className?: string; children: React.ReactNode };
type AsButton = Common & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & { href?: undefined };
type AsLink = Common & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'children' | 'className'> & { href: string };

/**
 * A `.btn` rendered by React: the fill that floods in from where the pointer enters, the label that rolls, and the slight
 * pull towards the pointer. The page effects (pageEffects.js rollButton) build the same inside for the old markup's
 * buttons by rewriting it; they skip a button that already has it, so React keeps control of this one's label.
 */
export default function RollButton(props: AsButton | AsLink) {
  const { className = '', children, ...rest } = props;
  const ref = useRef<HTMLElement | null>(null);
  const origin = (e: React.PointerEvent) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--fx', `${e.clientX - r.left}px`);
    el.style.setProperty('--fy', `${e.clientY - r.top}px`);
  };
  const handlers = {
    onPointerEnter: origin,
    onPointerLeave: (e: React.PointerEvent) => { origin(e); ref.current?.style.setProperty('--bx', '0px'); ref.current?.style.setProperty('--by', '0px'); },
    onPointerMove: (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--bx', `${(e.clientX - r.left - r.width / 2) * .18}px`);
      el.style.setProperty('--by', `${(e.clientY - r.top - r.height / 2) * .3}px`);
    },
  };
  const inside = (
    <>
      <span className="btn-fill" aria-hidden="true"></span>
      <span className="btn-label"><span className="roll"><span>{children}</span><span aria-hidden="true">{children}</span></span></span>
    </>
  );
  if (typeof rest.href === 'string') {
    return <a {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)} {...handlers} ref={(el) => { ref.current = el; }} className={`btn ${className}`.trim()}>{inside}</a>;
  }
  return <button type="button" {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)} {...handlers} ref={(el) => { ref.current = el; }} className={`btn ${className}`.trim()}>{inside}</button>;
}
