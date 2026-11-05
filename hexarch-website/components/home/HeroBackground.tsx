"use client";

import { motion, useScroll, useTransform, useReducedMotion } from "motion/react";
import { HexColumns } from "@/components/graphics/HexColumns";

/**
 * Page-load: the scene arrives out of a blur and zooms back to size.
 * On scroll: it sinks, softens and fades as the visitor moves down the page.
 */
export function HeroBackground() {
  const reduce = useReducedMotion();
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 900], [0, 180]);
  const scale = useTransform(scrollY, [0, 900], [1, 0.9]);
  const opacity = useTransform(scrollY, [0, 700], [1, 0.2]);
  const filter = useTransform(scrollY, [0, 700], ["blur(0px)", "blur(8px)"]);

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      initial={{ opacity: 0, scale: 1.15, filter: "blur(30px)" }}
      animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      transition={{ duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* drifting haze */}
      <div className="drift absolute -inset-[20%] bg-[radial-gradient(40%_35%_at_50%_60%,rgba(255,255,255,0.08),transparent_70%),radial-gradient(30%_30%_at_20%_30%,rgba(255,255,255,0.04),transparent_70%)]" />
      <motion.div className="absolute inset-x-0 top-[30%] -bottom-[6%] max-md:top-[42%]" style={reduce ? undefined : { y, scale, opacity, filter }}>
        <HexColumns className="absolute left-1/2 top-0 h-full w-[min(1100px,92vw)] -translate-x-1/2" />
      </motion.div>
      {/* centre light, like a studio lamp under the scene */}
      <div className="absolute left-1/2 top-[68%] h-[72px] w-[195px] -translate-x-1/2 bg-white blur-[70px]" />
      {/* light along the bottom edge */}
      <div className="absolute bottom-[-30px] left-1/2 h-[60px] w-[261px] -translate-x-1/2 rounded-full bg-white/30 blur-[62px]" />
      <div className="absolute inset-x-0 bottom-0 h-[40%] bg-gradient-to-b from-transparent to-black" />
    </motion.div>
  );
}
