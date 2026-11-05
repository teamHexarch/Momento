import Link from "next/link";
import { site } from "@/content/site";
import { Reveal } from "@/components/motion/motion";
import { BuildIcon } from "@/components/graphics/Graphics";
import { SectionHeading } from "@/components/home/parts";

/** Slot 5: four cards (the template's services row). */
export function Build() {
  const { build } = site;
  return (
    <section id="build" className="scroll-mt-24 pt-[140px] pb-[80px] max-md:pt-24">
      <div className="container-x">
        <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <SectionHeading tag={build.tag} serif={build.titleSerif} rest={build.title} />
          <Reveal delay={0.2} className="max-w-[420px] text-[16px] leading-6 text-muted">
            <p>{build.intro}</p>
          </Reveal>
        </div>

        <div className="mt-16 grid overflow-hidden rounded-card border border-line sm:grid-cols-2 lg:grid-cols-4">
          {build.cards.map((card, i) => {
            const inner = (
              <>
                {/* hover light, fades in from the top */}
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/10 to-transparent to-[46%] opacity-0 transition-opacity duration-700 ease-out-expo group-hover:opacity-100" />
                <BuildIcon kind={card.icon} className="relative mx-auto h-[150px] w-[175px] transition-transform duration-700 ease-out-expo group-hover:-translate-y-2 group-hover:scale-105" />
                <span className="relative mt-10 block text-[14px] font-medium text-soft">/{String(i + 1).padStart(2, "0")}</span>
                <span className="relative mt-3 block text-[24px] leading-8 font-medium tracking-[-0.02em]">{card.title}</span>
                <span className="relative mt-3 block text-[16px] leading-6 text-muted">{card.text}</span>
              </>
            );
            const cls =
              "group relative block h-full border-line px-8 pt-12 pb-10 max-lg:[&:nth-child(-n+2)]:border-b sm:max-lg:odd:border-r lg:[&:not(:last-child)]:border-r max-sm:[&:not(:last-child)]:border-b";
            return (
              <Reveal key={card.title} delay={i * 0.1} className={cls}>
                {"href" in card && card.href ? (
                  <Link href={card.href} className="block h-full">
                    {inner}
                  </Link>
                ) : (
                  <div className="h-full">{inner}</div>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
