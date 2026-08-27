"use client";

/**
 * Page transition.
 *
 * A `template` remounts on every navigation, so this gives each page a quiet
 * rise-and-fade as it arrives — movement that makes the app feel handled rather
 * than snapped between screens. Honours `prefers-reduced-motion`.
 */

import { motion, useReducedMotion } from "motion/react";

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
