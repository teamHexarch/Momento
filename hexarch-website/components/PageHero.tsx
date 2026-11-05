import { Reveal } from "@/components/motion/motion";
import { TagPill } from "@/components/home/parts";

/** Opening block for inner pages: tag, large headline with serif lead, short intro. */
export function PageHero({
  tag,
  serif,
  title,
  intro,
  children,
}: {
  tag: string;
  serif?: string;
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative isolate overflow-hidden pt-[200px] pb-[80px] max-md:pt-[150px]">
      <div aria-hidden="true" className="drift pointer-events-none absolute -inset-[20%] -z-10 bg-[radial-gradient(35%_30%_at_50%_30%,rgba(255,255,255,0.07),transparent_70%)]" />
      <div className="container-x">
        <Reveal onLoad delay={0.2} y={30}>
          <TagPill>{tag}</TagPill>
        </Reveal>
        <Reveal onLoad delay={0.35} y={40} blur>
          <h1 className="mt-8 text-[clamp(52px,7.5vw,112px)] leading-[0.98] font-normal tracking-[-0.05em]">
            {serif && <span className="font-serif tracking-[-0.03em] italic">{serif} </span>}
            {title}
          </h1>
        </Reveal>
        {intro && (
          <Reveal onLoad delay={0.5} y={30}>
            <p className="mt-8 max-w-[620px] text-[18px] leading-7 text-muted">{intro}</p>
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}
