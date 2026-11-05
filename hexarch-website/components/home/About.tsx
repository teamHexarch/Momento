import { site } from "@/content/site";
import { Reveal, Roll, ScrollZoom, WordReveal } from "@/components/motion/motion";
import { TagPill } from "@/components/home/parts";

/** Slot 6: about with facts. The paragraph zooms in and brightens word by word on scroll. */
export function About() {
  const { about } = site;
  return (
    <section id="about" className="relative py-[60px]">
      <div className="container-x">
        <div className="relative overflow-hidden rounded-[56px] border border-line bg-[linear-gradient(180deg,#0b0b0b_0%,#000_100%)] px-[72px] pt-[60px] pb-[72px] max-lg:px-8 max-md:rounded-[32px] max-md:px-5">
          <div className="flex justify-center">
            <Reveal y={30}>
              <TagPill>{about.tag}</TagPill>
            </Reveal>
          </div>

          <ScrollZoom from={0.55} className="relative mt-10">
            {/* giant soft wordmark behind the text */}
            <p
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 select-none text-center font-serif text-[clamp(100px,16vw,230px)] leading-none tracking-[-0.04em] text-white/[0.07] italic blur-[3px]"
            >
              {about.wordmark}
            </p>
            <WordReveal
              text={about.text}
              className="relative mx-auto max-w-[640px] py-16 text-center text-[clamp(20px,2vw,28px)] leading-[1.3] font-medium tracking-[-0.01em]"
            />
          </ScrollZoom>

          <div className="mt-10 grid gap-10 md:grid-cols-3">
            {about.stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 0.1} className="group">
                <p className="border-b border-line pb-4 text-[16px] text-muted">{s.label}</p>
                <p className="silver-text mt-6 w-fit text-[clamp(80px,9vw,128px)] leading-none font-medium tracking-[-0.04em]">
                  <Roll>{s.value}</Roll>
                </p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
