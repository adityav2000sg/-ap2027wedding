import { redirect } from "next/navigation";

import { formatDateRange } from "@/lib/dates";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { tablesFor } from "@/server/exports";
import { PrintTables } from "@/components/wedding/print-tables";

/** Printable logistics. Opens in its own tab and offers the print dialogue. */
export default async function LogisticsPrintPage() {
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
      title={`${snapshot.wedding.partnerAName} & ${snapshot.wedding.partnerBName} — logistics`}
      subtitle={`${formatDateRange(snapshot.wedding.startDate, snapshot.wedding.endDate)} · printed ${printed}`}
      tables={tablesFor("logistics", snapshot)}
    />
  );
}
