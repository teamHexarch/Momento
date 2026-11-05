import { site } from "@/content/site";
import { Reveal } from "@/components/motion/motion";
import { TagPill } from "@/components/home/parts";
import { FaqList } from "@/components/home/FaqList";

/** Slot 13: FAQ. */
export function Faq() {
  const { faq } = site;
  return (
    <section id="faq" className="pt-[60px]">
      <div className="px-6 max-md:px-3">
        <div className="rounded-t-[56px] border-x border-t border-line bg-[linear-gradient(180deg,#0d0d0d_0%,#000_80%)] pt-[100px] pb-[120px] max-md:rounded-t-[32px] max-md:pt-16">
          <div className="container-x">
            <div className="flex flex-col items-center text-center">
              <Reveal y={30}>
                <TagPill>{faq.tag}</TagPill>
              </Reveal>
              <Reveal y={40} blur delay={0.1}>
                <h2 className="gradient-text mt-6 text-[clamp(56px,6.7vw,96px)] leading-none font-medium tracking-[-0.04em]">FAQs</h2>
              </Reveal>
            </div>
            <FaqList items={faq.items} />
          </div>
        </div>
      </div>
    </section>
  );
}
