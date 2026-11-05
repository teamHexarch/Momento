import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { CoverZoom, Reveal, Roll } from "@/components/motion/motion";
import { MomentoPhone } from "@/components/graphics/Graphics";
import { ArrowIcon } from "@/components/Header";
import { Contact } from "@/components/home/Contact";
import { site } from "@/content/site";

export const metadata: Metadata = {
  title: "Momento",
  description: "Momento collects every photo from an event into one shared album. Guests scan one code; no sign-up.",
};

// Momento's own product details, from its live site.
const steps = [
  { title: "Create the event", text: "Name it, set a sharing zone around the venue, and choose where the photos land." },
  { title: "Put the code out", text: "Momento makes a QR code and a six-letter code for the tables, the screen or a link." },
  { title: "Guests scan and join", text: "One scan, no sign-up. Only guests inside the zone can join." },
  { title: "Everyone shares", text: "Guests share straight from their photos app, from phones and cameras." },
  { title: "It all lands in one album", text: "Full quality, sorted by device, saved in the cloud the host chose." },
];

const features = [
  { title: "Only the people who were there", text: "Each album has a sharing zone, so a wedding album never fills with strangers' photos." },
  { title: "Cameras and phones, together", text: "Photos from real cameras sit alongside phone photos in the same album." },
  { title: "Uploads that behave", text: "On mobile data, uploads can wait for Wi-Fi." },
  { title: "Your cloud, your copy", text: "Albums save to Google Drive, iCloud, Dropbox or OneDrive." },
];

export default function MomentoPage() {
  const momento = site.products.find((p) => p.slug === "momento")!;
  return (
    <>
      <PageHero tag="Case study" title="Momento" intro={`${momento.summary}. Guests scan one code to add their photos, with no sign-up.`}>
        <Reveal onLoad delay={0.65} y={30} className="mt-10 flex flex-wrap gap-3">
          <a href={momento.url} target="_blank" rel="noreferrer" className="group flex h-[54px] items-center gap-3 rounded-full bg-white pr-1.5 pl-6 text-[16px] font-semibold text-[#1b1b1b]">
            <Roll>Visit Momento</Roll>
            <span className="grid size-[42px] place-items-center rounded-full bg-black text-white">
              <ArrowIcon className="transition-transform duration-500 ease-out-expo group-hover:-rotate-45" />
            </span>
          </a>
          {momento.badges.map((b) => (
            <span key={b.title} className="flex h-[54px] items-center rounded-full border border-line px-6 text-[14px] text-soft">
              {b.title} · {b.detail}
            </span>
          ))}
        </Reveal>
      </PageHero>

      <section className="px-6 max-md:px-3">
        <div className="relative isolate overflow-hidden rounded-[56px] max-md:rounded-[32px]">
          <CoverZoom className="absolute inset-0 -z-10">
            <div className="absolute inset-0 bg-[#16151d]" />
            <div className="drift absolute -inset-[25%] bg-[radial-gradient(35%_40%_at_30%_35%,rgba(217,208,234,0.35),transparent_70%),radial-gradient(30%_35%_at_75%_60%,rgba(154,96,61,0.35),transparent_70%),radial-gradient(40%_40%_at_50%_100%,rgba(111,152,150,0.3),transparent_70%)]" />
          </CoverZoom>
          <div className="flex min-h-[760px] items-center justify-center py-20">
            <Reveal y={80} blur className="w-[min(320px,64vw)]">
              <MomentoPhone className="w-full drop-shadow-[0_40px_80px_rgba(0,0,0,0.6)]" />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="py-[120px]">
        <div className="container-x grid gap-16 lg:grid-cols-[1fr_1.4fr]">
          <Reveal>
            <h2 className="heading-xl">
              <span className="serif">The </span>problem
            </h2>
            <p className="mt-6 max-w-[460px] text-[18px] leading-7 text-muted">
              The best photos of an event end up spread across dozens of phones. Collecting them afterwards means weeks of chasing people in group chats.
            </p>
          </Reveal>
          <ol className="grid gap-3">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={i * 0.08} y={30} className="flex gap-6 rounded-card border border-line bg-[#0a0a0a] p-6">
                <span className="text-[14px] font-medium text-soft">/{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <span className="block text-[20px] font-medium tracking-[-0.01em]">{s.title}</span>
                  <span className="mt-1 block text-[16px] leading-6 text-muted">{s.text}</span>
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      <section className="pb-[120px]">
        <div className="container-x">
          <Reveal>
            <h2 className="heading-xl">
              <span className="serif">What </span>it does
            </h2>
          </Reveal>
          <ul className="mt-12 grid gap-4 md:grid-cols-2">
            {features.map((f, i) => (
              <Reveal as="li" key={f.title} delay={i * 0.08} className="rounded-card border border-line bg-[linear-gradient(180deg,#141414_0%,#050505_100%)] p-8">
                <h3 className="text-[24px] leading-8 font-medium tracking-[-0.02em]">{f.title}</h3>
                <p className="mt-3 text-[16px] leading-6 text-muted">{f.text}</p>
              </Reveal>
            ))}
          </ul>
          <Reveal className="mt-12 rounded-card border border-line p-8">
            <h3 className="text-[24px] font-medium tracking-[-0.02em]">Where it stands</h3>
            <p className="mt-3 max-w-[720px] text-[16px] leading-6 text-muted">
              Momento is a proof of concept, live at hexarch.org. It&apos;s free to start, and Momento Plus, a paid plan for bigger venues, is on the way.
            </p>
          </Reveal>
        </div>
      </section>

      <Contact />
    </>
  );
}
