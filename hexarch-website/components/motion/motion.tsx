"use client";

/**
 * The site's motion engine. Timings follow the reference template:
 * - entrances: opacity 0 -> 1 and a 30-60px rise, on a soft spring (bounce 0.2, about 1.5s)
 * - scroll zooms: content scales 0.5 -> 1 as it enters and back down as it leaves
 * - covers: images settle from 1.08 to 1 as they scroll in
 * - transitional blur: headings and panels sharpen from a blur as they arrive
 */

import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { useRef } from "react";

export const spring = { type: "spring" as const, bounce: 0.2, duration: 1.5 };
export const easeOutExpo = [0.16, 1, 0.3, 1] as const;

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  blur?: boolean;
  scale?: number;
  as?: "div" | "section" | "li" | "span" | "h2" | "p";
  /** Play on page load instead of when scrolled into view. */
  onLoad?: boolean;
};

/** Fades and rises into place. */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 60,
  blur = false,
  scale,
  as = "div",
  onLoad = false,
}: RevealProps) {
  const Tag = motion[as];
  const hidden = {
    opacity: 0,
    y,
    ...(scale ? { scale } : {}),
    ...(blur ? { filter: "blur(12px)" } : {}),
  };
  const shown = {
    opacity: 1,
    y: 0,
    ...(scale ? { scale: 1 } : {}),
    ...(blur ? { filter: "blur(0px)" } : {}),
  };
  return (
    <Tag
      className={className}
      initial={hidden}
      {...(onLoad
        ? { animate: shown }
        : { whileInView: shown, viewport: { once: true, amount: 0.25 } })}
      transition={{ ...spring, delay }}
    >
      {children}
    </Tag>
  );
}

/** Zooms in as it enters the viewport and back out as it leaves (scroll-linked). */
export function ScrollZoom({
  children,
  className,
  from = 0.5,
  blur = 10,
}: {
  children: React.ReactNode;
  className?: string;
  from?: number;
  blur?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.38, 0.62, 1], [from, 1, 1, from]);
  const opacity = useTransform(scrollYProgress, [0, 0.32, 0.68, 1], [0, 1, 1, 0]);
  const filter = useTransform(
    scrollYProgress,
    [0, 0.32, 0.68, 1],
    [`blur(${blur}px)`, "blur(0px)", "blur(0px)", `blur(${blur}px)`],
  );
  return (
    <motion.div
      ref={ref}
      className={className}
      style={reduce ? undefined : { scale, opacity, filter }}
    >
      {children}
    </motion.div>
  );
}

/** Settles from slightly zoomed in to normal size as it scrolls into view. */
export function CoverZoom({
  children,
  className,
  from = 1.1,
}: {
  children: React.ReactNode;
  className?: string;
  from?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start start"] });
  const scale = useTransform(scrollYProgress, [0, 1], [from, 1]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { scale }}>
      {children}
    </motion.div>
  );
}

/** Grows from a smaller size as it scrolls into view (used on product cards). */
export function ScrollGrow({
  children,
  className,
  from = 0.9,
}: {
  children: React.ReactNode;
  className?: string;
  from?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "start 0.35"] });
  const scale = useTransform(scrollYProgress, [0, 1], [from, 1]);
  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.4, 1, 1]);
  return (
    <motion.div ref={ref} className={className} style={reduce ? undefined : { scale, opacity }}>
      {children}
    </motion.div>
  );
}

/** Words brighten one by one as the paragraph scrolls through the viewport. */
export function WordReveal({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 0.85", "end 0.45"] });
  const words = text.split(" ");
  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <Word
          key={`${word}-${i}`}
          progress={scrollYProgress}
          range={[i / words.length, (i + 1) / words.length]}
          still={!!reduce}
        >
          {word}
        </Word>
      ))}
    </p>
  );
}

function Word({
  children,
  progress,
  range,
  still,
}: {
  children: string;
  progress: MotionValue<number>;
  range: [number, number];
  still: boolean;
}) {
  const opacity = useTransform(progress, range, [0.18, 1]);
  return (
    <>
      <motion.span style={still ? undefined : { opacity }}>{children}</motion.span>{" "}
    </>
  );
}

/** Two copies of a label; the second slides up on hover (used on buttons and big numbers). */
export function Roll({ children }: { children: React.ReactNode }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden="true">{children}</span>
    </span>
  );
}
