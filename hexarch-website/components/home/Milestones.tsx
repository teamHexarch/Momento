import { site } from "@/content/site";
import { Reveal } from "@/components/motion/motion";
import { TagPill } from "@/components/home/parts";

/** Slot 9: recognition. Hexarch shows real milestones until there are awards. */
export function Milestones() {
  const { milestones } = site;
  if (milestones.items.length === 0) return null;
  return (
    <section id="milestones" className="py-[100px]">
      <div className="container-x">
        <div className="flex justify-center">
          <Reveal y={30}>
            <TagPill>{milestones.tag}</TagPill>
          </Reveal>
        </div>
        <ul className="mt-12">
          {milestones.items.map((m, i) => (
            <Reveal as="li" key={m.title} delay={i * 0.08} y={30} className="group grid grid-cols-[1fr_auto] items-center gap-4 border-b border-line py-7 transition-colors duration-500 hover:bg-white/[0.02] md:grid-cols-[1fr_2fr_1fr]">
              <span className="text-[14px] text-muted max-md:col-span-2">{m.category}</span>
              <span className="text-[clamp(20px,1.9vw,28px)] font-medium tracking-[-0.02em] transition-transform duration-700 ease-out-expo group-hover:translate-x-2 md:text-center md:group-hover:translate-x-0 md:group-hover:scale-[1.03]">
                {m.title}
              </span>
              <span className="text-right text-[14px] text-muted">{m.detail}</span>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
