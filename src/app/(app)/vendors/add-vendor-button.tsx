"use client";

/**
 * The button that opens the vendor form.
 *
 * Split out because the vendors page is a server component and only this needs
 * to be interactive — the list itself stays server-rendered.
 */

import * as React from "react";

import { Button } from "@/components/ui/primitives";
import { PlusIcon } from "@/components/ui/icons";
import { VendorComposer } from "./vendor-composer";

export function AddVendorButton({
  events,
  members,
  baseCurrency,
}: {
  events: { id: string; name: string }[];
  members: { id: string; name: string }[];
  baseCurrency: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        className="h-9 shrink-0 gap-1.5"
        onClick={() => setOpen(true)}
      >
        <PlusIcon size={14} />
        Add vendor
      </Button>

      <VendorComposer
        open={open}
        onOpenChange={setOpen}
        events={events}
        members={members}
        baseCurrency={baseCurrency}
      />
    </>
  );
}
