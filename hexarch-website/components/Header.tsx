"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useScroll,
} from "motion/react";
import { site } from "@/content/site";
import { Logo } from "@/components/Logo";
import { Roll, spring } from "@/components/motion/motion";

export function Header() {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { scrollY } = useScroll();

  // Slides away while scrolling down, comes back on the way up.
  useMotionValueEvent(scrollY, "change", (y) => {
    const prev = scrollY.getPrevious() ?? 0;
    setScrolled(y > 40);
    setHidden(y > 320 && y > prev && !open);
  });

  return (
    <>
      <motion.header
        className="fixed inset-x-0 top-0 z-50"
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: hidden ? -110 : 0, opacity: 1 }}
        transition={{ ...spring, duration: 0.9, delay: hidden ? 0 : 0.1 }}
      >
        <div
          className={`transition-[background-color,backdrop-filter] duration-500 ${
            scrolled ? "bg-black/40 backdrop-blur-xl" : "bg-transparent"
          }`}
        >
          <div className="container-x flex h-[94px] items-center justify-between pt-[22px] pb-[18px]">
            <Link href="/" aria-label={`${site.company.name} home`} className="relative z-10">
              <Logo />
            </Link>

            <nav
              aria-label="Main"
              className="absolute left-1/2 hidden -translate-x-1/2 lg:block"
            >
              <ul className="flex items-center gap-1 rounded-full border border-line bg-white/[0.04] p-1.5 backdrop-blur-2xl">
                {site.nav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group block rounded-full px-4 py-2 text-[14px] leading-5 text-muted transition-colors duration-300 hover:bg-white/[0.06] hover:text-white"
                    >
                      <Roll>{item.label}</Roll>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <div className="flex items-center gap-3">
              <Link
                href={site.hero.cta.href}
                className="group hidden h-[54px] items-center gap-3 rounded-full bg-white pr-1.5 pl-6 text-[16px] font-semibold text-[#1b1b1b] transition-transform duration-500 ease-out-expo hover:scale-[1.03] sm:flex"
              >
                <Roll>Let&apos;s talk</Roll>
                <span className="grid size-[42px] place-items-center overflow-hidden rounded-full bg-black text-white">
                  <ArrowIcon className="transition-transform duration-500 ease-out-expo group-hover:-rotate-45" />
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-controls="site-menu"
                aria-label={open ? "Close menu" : "Open menu"}
                className="relative z-10 grid size-[54px] place-items-center rounded-full border border-line bg-white/[0.04] backdrop-blur-2xl lg:hidden"
              >
                <span className="relative block h-3 w-5">
                  <motion.span
                    className="absolute left-0 top-0 h-[1.5px] w-5 rounded bg-white"
                    animate={open ? { rotate: 45, y: 5.25 } : { rotate: 0, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  />
                  <motion.span
                    className="absolute bottom-0 left-0 h-[1.5px] w-5 rounded bg-white"
                    animate={open ? { rotate: -45, y: -5.25 } : { rotate: 0, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  />
                </span>
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <motion.div
            id="site-menu"
            className="fixed inset-0 z-40 flex flex-col bg-black/80 px-5 pt-[120px] pb-10 backdrop-blur-2xl lg:hidden"
            initial={{ opacity: 0, filter: "blur(12px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(12px)" }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            <ul className="flex flex-col gap-2">
              {site.nav.map((item, i) => (
                <motion.li
                  key={item.href}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  transition={{ ...spring, duration: 1, delay: 0.05 + i * 0.06 }}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-line py-4 text-[40px] leading-[1.1] font-medium tracking-[-0.03em]"
                  >
                    {item.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
            <Link
              href={site.hero.cta.href}
              onClick={() => setOpen(false)}
              className="mt-auto flex h-[54px] items-center justify-center rounded-full bg-white text-[16px] font-semibold text-[#1b1b1b]"
            >
              Let&apos;s talk
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
      <path d="M3.75 9h10.5M9.75 4.5 14.25 9l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
