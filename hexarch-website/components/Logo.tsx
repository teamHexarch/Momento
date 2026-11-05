/** Hexarch wordmark: a small hexagon mark and the name. Original to Hexarch. */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <svg width="26" height="28" viewBox="0 0 26 28" fill="none" aria-hidden="true">
        <path d="M13 1.5 24 7.75v12.5L13 26.5 2 20.25V7.75L13 1.5Z" stroke="white" strokeWidth="1.6" />
        <path d="M8 19.5V12a5 5 0 0 1 10 0v7.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="font-serif text-[26px] leading-none tracking-[-0.03em] italic">hexarch</span>
    </span>
  );
}
