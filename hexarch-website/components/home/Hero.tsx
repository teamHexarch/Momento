import Link from "next/link";
import { site } from "@/content/site";
import { Reveal, Roll } from "@/components/motion/motion";
import { HeroBackground } from "@/components/home/HeroBackground";
import { ArrowIcon } from "@/components/Header";
import { MomentoPhone } from "@/components/graphics/Graphics";

/** Slots 1–4 of the template order: hero, logo strip, "what we do" list and featured product. */
export function Hero() {
  const { hero } = site;
  const featured = site.products[0];
  return (
    <section className="relative isolate flex min-h-[max(860px,100svh)] flex-col overflow-hidden pt-[94px]">
      <HeroBackground />

      <div className="container-x relative flex flex-1 flex-col pt-[84px] max-md:pt-14">
        <div className="flex flex-col justify-between gap-10 lg:flex-row lg:items-start">
          <h1 className="text-white">
            <Reveal onLoad delay={1} y={30} as="span" className="display-hero block">
              {hero.lineOne}
            </Reveal>
            <Reveal onLoad delay={1.1} y={30} as="span" className="display-hero-serif block pl-[0.45em] pt-[0.18em] max-sm:pl-0">
              {hero.lineTwo}
            </Reveal>
          </h1>

          <div className="max-w-[440px] lg:pt-3">
            <Reveal onLoad delay={1.2} y={30}>
              <p className="text-[24px] leading-[1.25] tracking-[-0.01em] text-white max-md:text-[20px]">
                <span className="mr-2 inline-grid size-7 translate-y-[-2px] place-items-center rounded-full border border-white/60 align-middle text-[13px]">
                  ©
                </span>
                {hero.intro}
              </p>
            </Reveal>
            <Reveal onLoad delay={1.3} y={30} className="mt-8 flex items-center justify-between gap-6 border-t border-line pt-6">
              <Link href={hero.cta.href} className="group flex items-center gap-3 text-[18px] font-semibold text-soft">
                <Roll>{hero.cta.label}</Roll>
                <ArrowIcon className="transition-transform duration-500 ease-out-expo group-hover:translate-x-1" />
              </Link>
              {site.socials.length > 0 && (
                <ul className="flex gap-2">
                  {site.socials.map((s) => (
                    <li key={s.href}>
                      <a href={s.href} target="_blank" rel="noreferrer" aria-label={s.label} className="grid size-10 place-items-center rounded-full border border-line text-[12px] transition-colors hover:bg-white hover:text-black">
                        {s.label.slice(0, 2)}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </Reveal>
          </div>
        </div>

        <div className="mt-auto grid items-end gap-8 pt-16 pb-6 md:grid-cols-3">
          {/* Slot 3: what we do */}
          <Reveal onLoad delay={1.5} y={30}>
            <p className="border-b border-line pb-3 text-[16px] text-soft">We do</p>
            <p className="mt-3 max-w-[340px] text-[16px] leading-6 tracking-[-0.03em] text-muted">
              {hero.weDo.map((item, i) => (
                <span key={item} className="whitespace-nowrap">
                  {item}
                  {i < hero.weDo.length - 1 && <span className="px-2 text-white/40">/</span>}
                </span>
              ))}
            </p>
          </Reveal>

          <Reveal onLoad delay={1.6} y={30} className="hidden justify-center md:flex">
            <a href="#build" aria-label="Scroll to what we build" className="grid size-12 place-items-center rounded-full border border-line bg-white/[0.04] backdrop-blur-xl transition-colors hover:bg-white/10">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="animate-bounce">
                <path d="m3.5 6 4.5 4.5L12.5 6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </Reveal>

          {/* Slot 4: featured product */}
          {featured && (
            <Reveal onLoad delay={1.6} y={30} className="md:justify-self-end">
              <div className="flex items-center justify-between border-b border-line pb-3 text-[16px] md:w-[300px]">
                <span className="text-soft">Featured</span>
                <span className="text-muted">({String(site.products.length).padStart(2, "0")})</span>
              </div>
              <Link
                href={`/products/${featured.slug}`}
                className="group mt-3 flex items-center gap-4 rounded-[14px] border border-line bg-[#121212] p-2.5 transition-colors duration-500 hover:bg-[#1b1b1b] md:w-[300px]"
              >
                <span className="relative h-[86px] w-[72px] shrink-0 overflow-hidden rounded-[10px] bg-[#2E2C3A]">
                  <MomentoPhone className="absolute left-1/2 top-2 w-[54px] -translate-x-1/2 transition-transform duration-700 ease-out-expo group-hover:-translate-y-1 group-hover:scale-105" />
                </span>
                <span>
                  <span className="block text-[16px] font-medium">{featured.name}</span>
                  <span className="mt-1 block text-[14px] leading-5 text-muted">{featured.summary}</span>
                </span>
              </Link>
            </Reveal>
          )}
        </div>
      </div>

      {/* Slot 2: logo strip (Hexarch focus words until there are real partner logos) */}
      <Reveal onLoad delay={1.7} y={20} className="marquee-mask relative border-t border-line py-6">
        <div className="marquee-track" style={{ ["--marquee-duration" as string]: "45s" }}>
          {[0, 1].map((copy) => (
            <ul key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
              {site.marqueeWords.map((w) => (
                <li key={w} className="flex items-center px-8 font-serif text-[30px] text-white/45 italic">
                  {w}
                  <svg width="14" height="16" viewBox="0 0 26 28" className="ml-16 opacity-40" aria-hidden="true">
                    <path d="M13 1.5 24 7.75v12.5L13 26.5 2 20.25V7.75L13 1.5Z" fill="none" stroke="white" strokeWidth="2" />
                  </svg>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
