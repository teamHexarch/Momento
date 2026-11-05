import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/PageHero";
import { Reveal, Roll } from "@/components/motion/motion";
import { ArrowIcon } from "@/components/Header";
import { Milestones } from "@/components/home/Milestones";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Investors",
  description: "Where Hexarch is today, the market it's building for, and how to get in touch.",
};

export default function InvestorsPage() {
  const { investors } = site;
  const blocks = [
    { title: "Where we are", text: investors.stage },
    { title: "The market", text: investors.marketNote },
    { title: "Traction", text: investors.traction },
  ];
  return (
    <>
      <PageHero
        tag="Investors"
        serif="For"
        title="investors"
        intro="Hexarch builds products for the moments people share. Here's where things stand today, in plain numbers."
      />

      <section className="pb-[60px]">
        <div className="container-x grid gap-4 lg:grid-cols-3">
          {blocks.map((b, i) => (
            <Reveal key={b.title} delay={i * 0.1} className="flex min-h-[300px] flex-col rounded-card border border-line bg-[linear-gradient(180deg,#141414_0%,#050505_100%)] p-8">
              <span className="text-[14px] font-medium text-soft">/{String(i + 1).padStart(2, "0")}</span>
              <h2 className="mt-3 text-[28px] leading-9 font-medium tracking-[-0.02em]">{b.title}</h2>
              <p className="mt-4 text-[16px] leading-6 text-muted">{b.text}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <Milestones />

      <section className="pb-[100px]">
        <div className="container-x">
          <Reveal className="flex flex-col items-start justify-between gap-8 rounded-[40px] border border-line bg-[#0a0a0a] p-12 md:flex-row md:items-center max-md:p-7">
            <div>
              <h2 className="heading-xl">
                <span className="serif">Let&apos;s </span>talk
              </h2>
              <p className="mt-4 max-w-[520px] text-[16px] leading-6 text-muted">
                Ask for our deck, or tell us what you&apos;d like to know. We&apos;ll reply by email.
              </p>
            </div>
            <Link href="/contact#investors" className="group flex h-[54px] items-center gap-3 rounded-full bg-white pr-1.5 pl-6 text-[16px] font-semibold text-[#1b1b1b]">
              <Roll>Request the deck</Roll>
              <span className="grid size-[42px] place-items-center rounded-full bg-black text-white">
                <ArrowIcon className="transition-transform duration-500 ease-out-expo group-hover:-rotate-45" />
              </span>
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
