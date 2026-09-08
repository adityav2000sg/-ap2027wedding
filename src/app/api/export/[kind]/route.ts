/**
 * Downloading a list.
 *
 * `/api/export/guests?format=xlsx` and `/api/export/logistics?format=csv`.
 *
 * Authenticated like everything else — these files contain every guest's phone
 * number, dietary needs and room, so the route resolves the viewer server-side
 * rather than trusting that only signed-in people know the URL.
 *
 * Excel gets a real .xlsx with frozen headers and sized columns, because the
 * whole point is that somebody opens it and works in it. CSV is there for
 * anything that chokes on xlsx.
 *
 * PDF isn't here: it's a print view at /guests/print, which the browser turns
 * into a PDF that respects the reader's paper size and needs no font embedding.
 */

import { NextResponse } from "next/server";

import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { tablesFor, type Table } from "@/server/exports";

export const dynamic = "force-dynamic";

const KINDS = ["guests", "logistics"] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { kind } = await params;
  if (!KINDS.includes(kind as (typeof KINDS)[number])) {
    return NextResponse.json({ error: "Unknown export." }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "xlsx";
  const snapshot = await loadSnapshot(viewer.weddingId);
  const tables = tablesFor(kind as (typeof KINDS)[number], snapshot);

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `${kind}-${stamp}`;

  if (format === "csv") {
    // One file, so several tables are stacked with their names as separators.
    const body = tables.map(toCsv).join("\n\n");
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${base}.csv"`,
      },
    });
  }

  if (format !== "xlsx") {
    return NextResponse.json({ error: "Unknown format." }, { status: 400 });
  }

  // Imported here so the CSV path never loads it — it's a large dependency.
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Avantika & Prateek";
  workbook.created = new Date();

  for (const table of tables) {
    const sheet = workbook.addWorksheet(table.name);
    sheet.columns = table.columns.map((column) => ({
      header: column.label,
      key: column.key,
      width: column.width ?? 18,
    }));

    for (const row of table.rows) sheet.addRow(row);

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: "middle" };
    // Headers stay put while you scroll a 267-row list.
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: table.columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${base}.xlsx"`,
    },
  });
}

function toCsv(table: Table): string {
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    // A guest called O'Brien is fine; one with a comma in their notes is not.
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const lines = [
    table.name,
    table.columns.map((c) => escape(c.label)).join(","),
    ...table.rows.map((row) =>
      table.columns.map((c) => escape(row[c.key] ?? "")).join(","),
    ),
  ];
  return lines.join("\n");
}
