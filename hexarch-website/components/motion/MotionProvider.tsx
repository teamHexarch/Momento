"use client";

import { MotionConfig } from "motion/react";

/** Respects the visitor's "reduce motion" setting for every Motion animation on the site. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
