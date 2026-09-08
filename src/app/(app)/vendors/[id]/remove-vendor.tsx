"use client";

/**
 * Taking a vendor off the list.
 *
 * Archives rather than deletes: a vendor you ruled out is a decision you made,
 * and the quote you rejected is the reason the one you took looks reasonable.
 * Payments and contracts recorded against them stay put.
 *
 * Two steps, because it's off-screen the moment it happens and there's no undo
 * in front of the person doing it.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { Button } from "@/components/ui/primitives";
import { archiveVendor } from "@/server/actions/vendors";

export function RemoveVendor({
  vendorId,
  vendorName,
}: {
  vendorId: string;
  vendorName: string;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [confirming, setConfirming] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    const result = await archiveVendor(vendorId);
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      setConfirming(false);
      return;
    }
    router.push("/vendors");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[12.5px] text-ink-faint transition-colors hover:text-critical"
      >
        Remove {vendorName}
      </button>
    );
  }

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-[12.5px] text-ink-muted">
        Take {vendorName} off the list?
      </span>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      <Button variant="danger" size="sm" disabled={pending} onClick={remove}>
        {pending ? "Removing…" : "Remove"}
      </Button>
      {error ? (
        <span className="text-[12px] text-critical">{error}</span>
      ) : null}
    </motion.div>
  );
}
