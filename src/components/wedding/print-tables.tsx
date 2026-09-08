"use client";

/**
 * The printable version of a list.
 *
 * Deliberately plain: black on white, no gradients, no script face, columns
 * that fit landscape A4. The screen version is styled for a screen; this one
 * has to survive being printed on somebody's office laser printer and carried
 * around an airport.
 *
 * Headers repeat on every page, rows don't break across pages, and the app
 * chrome is hidden — all of which is what a print stylesheet is for.
 */

import * as React from "react";

import type { Table } from "@/server/exports";

export function PrintTables({
  title,
  subtitle,
  tables,
}: {
  title: string;
  subtitle: string;
  tables: Table[];
}) {
  // Deliberately not auto-printing. A dialogue that appears before the reader
  // has seen the page is a dialogue they dismiss to find out what it was, and
  // this view is worth glancing at first — it's the thing being handed to a
  // caterer.

  return (
    <div className="print-sheet">
      <style>{`
        @page { size: A4 landscape; margin: 12mm; }
        .print-sheet {
          background: #fff;
          color: #111;
          font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
          font-size: 9.5pt;
          padding: 16px;
        }
        .print-sheet h1 { font-size: 16pt; margin: 0 0 2px; font-weight: 600; }
        .print-sheet h2 { font-size: 11pt; margin: 18px 0 6px; font-weight: 600; }
        .print-sheet .meta { color: #555; font-size: 9pt; margin: 0 0 4px; }
        .print-sheet table { width: 100%; border-collapse: collapse; }
        .print-sheet th {
          text-align: left;
          border-bottom: 1px solid #333;
          padding: 4px 6px 4px 0;
          font-size: 8.5pt;
          text-transform: uppercase;
          letter-spacing: .04em;
        }
        .print-sheet td {
          border-bottom: 1px solid #e5e5e5;
          padding: 4px 6px 4px 0;
          vertical-align: top;
        }
        /* A row split across a page break is unreadable on paper. */
        .print-sheet tr { break-inside: avoid; }
        .print-sheet thead { display: table-header-group; }
        .print-toolbar { margin-bottom: 14px; }

        @media print {
          .print-toolbar { display: none; }
          .print-sheet { padding: 0; }
        }
      `}</style>

      <div className="print-toolbar">
        <button
          type="button"
          onClick={() => window.print()}
          style={{
            padding: "8px 14px",
            fontSize: "13px",
            borderRadius: "10px",
            border: "1px solid #ccc",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Print or save as PDF
        </button>
      </div>

      <h1>{title}</h1>
      <p className="meta">{subtitle}</p>

      {tables.map((table) => (
        <section key={table.name}>
          <h2>
            {table.name}
            <span style={{ fontWeight: 400, color: "#666" }}>
              {" "}
              · {table.rows.length} {table.rows.length === 1 ? "row" : "rows"}
            </span>
          </h2>
          <table>
            <thead>
              <tr>
                {table.columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, index) => (
                <tr key={index}>
                  {table.columns.map((column) => (
                    <td key={column.key}>{row[column.key] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
