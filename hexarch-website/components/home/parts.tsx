import { Reveal } from "@/components/motion/motion";

export function TagPill({ children, icon = true }: { children: React.ReactNode; icon?: boolean }) {
  return (
    <span className="tag-pill">
      {icon && (
        <svg width="16" height="18" viewBox="0 0 26 28" fill="none" aria-hidden="true">
          <path d="M13 1.5 24 7.75v12.5L13 26.5 2 20.25V7.75L13 1.5Z" stroke="currentColor" strokeWidth="2.2" />
        </svg>
      )}
      {children}
    </span>
  );
}

/** Tag pill + large headline with a serif italic lead, as in the template's section headers. */
export function SectionHeading({
  tag,
  serif,
  rest,
  serifFirst = true,
  center = false,
  as: Tag = "h2",
}: {
  tag: string;
  serif?: string;
  rest: string;
  serifFirst?: boolean;
  center?: boolean;
  as?: "h1" | "h2";
}) {
  return (
    <div className={center ? "flex flex-col items-center text-center" : ""}>
      <Reveal y={30}>
        <TagPill>{tag}</TagPill>
      </Reveal>
      <Reveal y={40} blur delay={0.1}>
        <Tag className="heading-xl mt-6">
          {serifFirst && serif && <span className="serif">{serif} </span>}
          {rest}
          {!serifFirst && serif && <span className="serif"> {serif}</span>}
        </Tag>
      </Reveal>
    </div>
  );
}
