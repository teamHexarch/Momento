"use client";

import Image from "next/image";
import { useRef } from "react";
import { motion } from "motion/react";
import { PortraitPlaceholder } from "@/components/graphics/Graphics";

type Member = { name: string; role: string; country: string; photo: string | null };

/** A row of team cards that scrolls sideways, with back and next buttons, like the template's team slider. */
export function TeamCarousel({ members }: { members: Member[] }) {
  const track = useRef<HTMLUListElement>(null);

  const scrollByCard = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector("li");
    const step = card ? card.getBoundingClientRect().width + 16 : el.clientWidth * 0.8;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="mt-14">
      <div className="mb-6 flex justify-end gap-2">
        {([-1, 1] as const).map((dir) => (
          <button
            key={dir}
            type="button"
            onClick={() => scrollByCard(dir)}
            aria-label={dir === -1 ? "Previous team members" : "Next team members"}
            className="grid size-12 place-items-center rounded-full border border-line bg-white/[0.04] backdrop-blur-xl transition-colors duration-300 hover:bg-white hover:text-black"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" className={dir === -1 ? "rotate-180" : ""}>
              <path d="M3.75 9h10.5M9.75 4.5 14.25 9l-4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ))}
      </div>

      <ul
        ref={track}
        className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Team members"
      >
        {members.map((m, i) => (
          <motion.li
            key={m.name}
            className="group relative aspect-[4/5] w-[82%] shrink-0 snap-start overflow-hidden rounded-card border border-line bg-card sm:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]"
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ type: "spring", bounce: 0.2, duration: 1.5, delay: (i % 3) * 0.1 }}
          >
            <div className="absolute inset-0 transition-transform duration-[1.2s] ease-out-expo group-hover:scale-105">
              {m.photo ? (
                <Image src={m.photo} alt={m.role ? `${m.name}, ${m.role}` : m.name} fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 82vw" className="object-cover" />
              ) : (
                <PortraitPlaceholder name={m.name} />
              )}
            </div>
            <span className="absolute left-5 top-5 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-[14px] text-soft backdrop-blur-[22px]">
              {m.country}
            </span>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-6 pt-16 pb-6 backdrop-blur-[5px] [mask-image:linear-gradient(to_top,#000_60%,transparent)]">
              <p className="text-[24px] leading-8 font-medium tracking-[-0.02em]">{m.name}</p>
              {m.role && <p className="mt-1 text-[14px] text-muted">{m.role}</p>}
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
