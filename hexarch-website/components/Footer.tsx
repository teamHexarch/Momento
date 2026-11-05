import Link from "next/link";
import { site } from "@/content/site";
import { Reveal, Roll } from "@/components/motion/motion";
import { BackToTop } from "@/components/BackToTop";

export function Footer() {
  const hasSocials = site.socials.length > 0;
  return (
    <footer className="relative overflow-hidden pt-[120px] pb-10 max-md:pt-20">
      <div className="container-x">
        <div className="grid gap-12 md:grid-cols-[1.2fr_1fr] lg:grid-cols-[1.4fr_1fr_1fr]">
          <div className="grid content-start gap-10 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-[14px] text-muted">Location</p>
              <p className="mt-3 text-[16px] leading-6 text-soft">{site.company.location}</p>
            </div>
            <div>
              <p className="text-[14px] text-muted">Contact</p>
              <a
                href={`mailto:${site.company.email}`}
                className="mt-3 block text-[16px] leading-6 text-soft underline-offset-4 hover:underline"
              >
                {site.company.email}
              </a>
            </div>
          </div>

          <div className="flex gap-6">
            <p className="text-[14px] text-muted">Links</p>
            <ul className="grid gap-2">
              {[...site.nav.filter((n) => !n.href.includes("#")), { label: "Home", href: "/" }].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="group text-[28px] leading-[1.25] tracking-[-0.02em] text-white">
                    <Roll>{l.label}</Roll>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {hasSocials && (
            <div className="flex gap-6">
              <p className="text-[14px] text-muted">Socials</p>
              <ul className="grid gap-2">
                {site.socials.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} target="_blank" rel="noreferrer" className="group text-[28px] leading-[1.25] tracking-[-0.02em]">
                      <Roll>{s.label}</Roll>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Reveal y={80} blur className="pointer-events-none relative mt-10 select-none">
        <p
          aria-hidden="true"
          className="text-center font-serif text-[clamp(120px,27vw,420px)] leading-[0.95] tracking-[-0.05em] italic"
          style={{
            background: "linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.08) 85%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          {site.about.wordmark}
        </p>
      </Reveal>

      <div className="container-x">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6 text-[14px] text-muted">
          <p>
            © {site.company.year} {site.company.legalName}. All rights reserved.
          </p>
          <BackToTop />
        </div>
      </div>
    </footer>
  );
}
