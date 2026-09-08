import { redirect } from "next/navigation";

import { formatDateRange } from "@/lib/dates";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { tablesFor } from "@/server/exports";
import { PrintTables } from "@/components/wedding/print-tables";

/** Printable guests. Opens in its own tab and offers the print dialogue. */
export default async function GuestsPrintPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);
  const printed = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <PrintTables
      title={`${snapshot.wedding.partnerAName} & ${snapshot.wedding.partnerBName} — guests`}
      subtitle={`${formatDateRange(snapshot.wedding.startDate, snapshot.wedding.endDate)} · printed ${printed}`}
      tables={tablesFor("guests", snapshot)}
    />
  );
}
