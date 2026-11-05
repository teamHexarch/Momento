import { site } from "@/content/site";
import { Reveal } from "@/components/motion/motion";
import { SectionHeading } from "@/components/home/parts";

const stepIcons = [
  // research: magnifier
  <path key="r" d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 4 4" />,
  // design: pen
  <path key="d" d="m14.5 5.5 4 4L9 19H5v-4l9.5-9.5Z" />,
  // build: brackets
  <path key="b" d="m8 7-5 5 5 5m8-10 5 5-5 5" />,
  // test: check
  <path key="t" d="m5 12.5 4.5 4.5L19 7.5" />,
];

/** Slot 8: process, a real four-step sequence. */
export function Process() {
  const { process } = site;
  return (
    <section id="process" className="scroll-mt-24 py-[60px]">
      <div className="container-x">
        <div className="rounded-[56px] border border-line bg-[linear-gradient(180deg,#0c0c0c_0%,#000_70%)] px-[72px] py-[100px] max-lg:px-8 max-md:rounded-[32px] max-md:px-5 max-md:py-16">
          <div className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <SectionHeading tag={process.tag} serif={process.titleSerif} rest={process.title} />
            <Reveal delay={0.2} className="max-w-[420px] text-[16px] leading-6 text-muted">
              <p>{process.intro}</p>
            </Reveal>
          </div>

          <ol className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {process.steps.map((step, i) => (
              <Reveal as="li" key={step.title} delay={i * 0.1} className="group relative flex min-h-[340px] flex-col overflow-hidden rounded-card border border-line bg-[linear-gradient(180deg,#141414_0%,#050505_100%)] px-7 pt-8 transition-transform duration-700 ease-out-expo hover:-translate-y-1.5">
                <span className="text-[14px] font-medium text-soft">/{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-[24px] leading-8 font-medium tracking-[-0.02em]">{step.title}</h3>
                <p className="mt-3 text-[16px] leading-6 text-muted">{step.text}</p>
                {/* glowing dome with the step icon */}
                <div className="relative mt-auto h-[120px]">
                  <div className="absolute -bottom-[150px] left-1/2 h-[260px] w-[130%] -translate-x-1/2 rounded-[50%] border-t border-white/15 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(255,255,255,0.12),transparent_80%)] transition-opacity duration-700 group-hover:opacity-100 opacity-70" />
                  <span className="absolute bottom-8 left-1/2 grid size-10 -translate-x-1/2 place-items-center rounded-full bg-white text-black transition-transform duration-700 ease-out-expo group-hover:scale-110">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      {stepIcons[i % stepIcons.length]}
                    </svg>
                  </span>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
