"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <ul className="mx-auto mt-16 max-w-[900px]">
      {items.map((item, i) => {
        const isOpen = open === i;
        const id = `faq-${i}`;
        return (
          <motion.li
            key={item.q}
            className="border-b border-line"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", bounce: 0.2, duration: 1.4, delay: i * 0.06 }}
          >
            <h3>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={id}
                onClick={() => setOpen(isOpen ? null : i)}
                className="group flex w-full items-center justify-between gap-6 py-7 text-left text-[clamp(18px,1.5vw,22px)] font-medium tracking-[-0.01em]"
              >
                {item.q}
                <motion.span
                  className={`grid size-10 shrink-0 place-items-center rounded-full transition-colors duration-500 ${
                    isOpen ? "bg-white text-black" : "bg-white/10 text-white group-hover:bg-white/20"
                  }`}
                  animate={{ rotate: isOpen ? 45 : 0 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </motion.span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  id={id}
                  key="answer"
                  initial={{ height: 0, opacity: 0, filter: "blur(6px)" }}
                  animate={{ height: "auto", opacity: 1, filter: "blur(0px)" }}
                  exit={{ height: 0, opacity: 0, filter: "blur(6px)" }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <p className="max-w-[720px] pb-8 text-[16px] leading-6 text-muted">{item.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        );
      })}
    </ul>
  );
}
