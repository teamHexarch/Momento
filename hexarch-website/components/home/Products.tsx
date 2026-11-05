import Link from "next/link";
import { site } from "@/content/site";
import { CoverZoom, Reveal, Roll, ScrollGrow } from "@/components/motion/motion";
import { MomentoPhone } from "@/components/graphics/Graphics";
import { ArrowIcon } from "@/components/Header";

/** Slot 7: product cards, shown as large covers that settle into place as they scroll in. */
export function Products({ showAllLink = true }: { showAllLink?: boolean }) {
  return (
    <section id="products" className="relative py-[60px]">
      <div className="flex flex-col gap-6 px-6 max-md:px-3">
        {site.products.map((p) => (
          <article key={p.slug} className="relative isolate overflow-hidden rounded-[56px] max-md:rounded-[32px]">
            {/* cover: Momento's own colours with a slow drift, settling from a zoom */}
            <CoverZoom from={1.1} className="absolute inset-0 -z-10">
              <div className="absolute inset-0 bg-[#16151d]" />
              <div className="drift absolute -inset-[25%] bg-[radial-gradient(35%_40%_at_30%_35%,rgba(217,208,234,0.35),transparent_70%),radial-gradient(30%_35%_at_75%_60%,rgba(154,96,61,0.35),transparent_70%),radial-gradient(40%_40%_at_50%_100%,rgba(111,152,150,0.3),transparent_70%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2)_0%,rgba(0,0,0,0)_40%,rgba(0,0,0,0.75)_100%)]" />
            </CoverZoom>

            <div className="container-x relative flex min-h-[960px] flex-col justify-between py-[60px] max-md:min-h-[820px] max-md:py-8">
              <ScrollGrow from={0.9} className="flex flex-wrap items-start justify-between gap-6">
                <ul className="flex flex-col gap-2">
                  {p.tags.map((t) => (
                    <li key={t} className="w-fit rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-[14px] text-soft backdrop-blur-[24px]">
                      {t}
                    </li>
                  ))}
                </ul>
                <ul className="flex flex-col gap-4">
                  {p.badges.map((b) => (
                    <li key={b.title} className="flex items-center gap-4 border-b border-white/15 pb-4">
                      <span className="grid h-10 min-w-12 place-items-center rounded-lg bg-white px-2 text-[14px] font-semibold text-black">{b.mark}</span>
                      <span>
                        <span className="block text-[14px] font-medium text-soft">{b.title}</span>
                        <span className="block text-[14px] text-faint">{b.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollGrow>

              <Reveal y={80} blur className="pointer-events-none absolute left-1/2 top-1/2 w-[min(300px,62vw)] -translate-x-1/2 -translate-y-[55%]">
                <MomentoPhone className="w-full drop-shadow-[0_40px_80px_rgba(0,0,0,0.6)]" />
              </Reveal>

              <Reveal y={60} className="relative mt-[420px] rounded-card border border-white/10 bg-black/30 p-8 backdrop-blur-[5px] max-md:p-6">
                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                  <div>
                    <p className="text-[16px] text-soft">{p.summary}</p>
                    <h3 className="heading-xl mt-3">{p.name}</h3>
                  </div>
                  <Link
                    href={`/products/${p.slug}`}
                    className="group flex h-[54px] w-fit items-center gap-3 rounded-full bg-white pr-1.5 pl-6 text-[16px] font-semibold text-[#1b1b1b]"
                  >
                    <Roll>View case study</Roll>
                    <span className="grid size-[42px] place-items-center rounded-full bg-black text-white">
                      <ArrowIcon className="transition-transform duration-500 ease-out-expo group-hover:-rotate-45" />
                    </span>
                  </Link>
                </div>
              </Reveal>
            </div>
          </article>
        ))}
      </div>

      {showAllLink && (
        <Reveal className="mt-12 flex justify-center">
          <Link href="/products" className="group flex h-[54px] items-center gap-3 rounded-full border border-line bg-white/[0.04] px-7 text-[16px] font-semibold backdrop-blur-xl transition-colors hover:bg-white/10">
            <Roll>See all products</Roll>
          </Link>
        </Reveal>
      )}
    </section>
  );
}
