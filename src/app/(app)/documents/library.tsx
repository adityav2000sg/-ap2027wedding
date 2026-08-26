"use client";

/**
 * The document library.
 *
 * A cross-wedding index rather than the only place files live — the same
 * contract shows here, on the vendor, and against the payment, because it's one
 * file with several associations.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { formatMediumDate } from "@/lib/dates";
import { Badge, EmptyState } from "@/components/ui/primitives";
import { Input, Select } from "@/components/ui/form";
import { DownloadIcon, FileIcon, LockIcon, SearchIcon } from "@/components/ui/icons";
import { Uploader } from "@/components/media/uploader";
import { Lightbox } from "@/components/media/lightbox";

interface Item {
  id: string; title: string; filename: string; kind: string; mimeType: string;
  sizeBytes: number; url: string; previewUrl: string | null;
  uploadedBy: string | null; createdAt: string; linkedTo: string[]; restricted: boolean;
}

const KIND_LABEL: Record<string, string> = {
  CONTRACT: "Contract", INVOICE: "Invoice", QUOTE: "Quote", MENU: "Menu",
  MOODBOARD: "Moodboard", PLAN: "Plan", ITINERARY: "Itinerary",
  RECEIPT: "Receipt", OTHER: "Other", PHOTO: "Photo",
  DOCUMENT: "Document", REFERENCE: "Reference",
};

export function DocumentsLibrary({
  items, canUpload, vendors, events,
}: {
  items: Item[];
  canUpload: boolean;
  vendors: { id: string; name: string }[];
  events: { id: string; name: string }[];
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    return items
      .filter((item) => !kind || item.kind === kind)
      .filter(
        (item) =>
          !q ||
          item.title.toLowerCase().includes(q) ||
          item.filename.toLowerCase().includes(q) ||
          item.linkedTo.some((l) => l.toLowerCase().includes(q)),
      );
  }, [items, query, kind]);

  const images = filtered.filter((i) => i.previewUrl);
  const kinds = [...new Set(items.map((i) => i.kind))];

  return (
    <div className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8">
      <header className="mb-6">
        <div className="eyebrow mb-2">Everything on file</div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[34px] leading-tight text-ink">Documents</h1>
            <p className="mt-1.5 text-[13.5px] text-ink-muted">
              {items.length === 0
                ? "Contracts, quotes, invoices and menus — all in one place."
                : `${items.length} ${items.length === 1 ? "file" : "files"}. The same file can sit against a vendor, a payment and here at once.`}
            </p>
          </div>
          <div className="relative">
            <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files…"
              className="h-8 w-56 pl-8 text-[12.5px]"
            />
          </div>
        </div>
      </header>

      {canUpload ? (
        <Uploader
          className="mb-6"
          accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv"
          compact={items.length > 0}
          label={items.length === 0 ? "Upload your first documents" : "Add files"}
          hint="Contracts, quotes, invoices, menus, floor plans, reference images."
          onUploaded={() => router.refresh()}
        />
      ) : null}

      {items.length === 0 ? (
        <EmptyState
          title="Nothing on file yet"
          description="As vendors send quotes and contracts, upload them here — or straight onto the vendor, which puts them in both places."
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="h-8 w-auto min-w-[140px] text-[12.5px]"
            >
              <option value="">Every type</option>
              {kinds.map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k] ?? k}</option>
              ))}
            </Select>
            <span className="tabular text-[12px] text-ink-muted">
              {filtered.length} shown
            </span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="Nothing matches" description="Try a different search or type." />
          ) : (
            <ul>
              {filtered.map((item, index) => {
                const imageIndex = images.findIndex((i) => i.id === item.id);
                return (
                  <motion.li
                    key={item.id}
                    initial={reduce ? false : { opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.3,
                      ease: [0.22, 1, 0.36, 1],
                      delay: reduce ? 0 : Math.min(index * 0.03, 0.3),
                    }}
                    className="border-b border-line last:border-b-0"
                  >
                    <div className="group flex items-center gap-3.5 py-3">
                      {item.previewUrl ? (
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(imageIndex)}
                          className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-sunken"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={item.previewUrl}
                            alt=""
                            loading="lazy"
                            className="h-full w-full object-cover transition-transform duration-400 group-hover:scale-105"
                          />
                        </button>
                      ) : (
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-ink-muted">
                          <FileIcon size={16} />
                        </span>
                      )}

                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="min-w-0 flex-1"
                      >
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13.5px] text-ink transition-colors group-hover:text-saffron">
                            {item.title}
                          </span>
                          {item.restricted ? (
                            <span title="Restricted to owners, admins and the planner">
                              <LockIcon size={11} className="text-ink-faint" />
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-muted">
                          <span>{KIND_LABEL[item.kind] ?? item.kind}</span>
                          <span className="text-ink-faint">·</span>
                          <span>{formatBytes(item.sizeBytes)}</span>
                          <span className="text-ink-faint">·</span>
                          <span>{formatMediumDate(new Date(item.createdAt))}</span>
                          {item.uploadedBy ? (
                            <>
                              <span className="text-ink-faint">·</span>
                              <span>{item.uploadedBy}</span>
                            </>
                          ) : null}
                        </span>
                      </a>

                      {item.linkedTo.length > 0 ? (
                        <span className="hidden shrink-0 gap-1 sm:flex">
                          {item.linkedTo.slice(0, 2).map((link) => (
                            <Badge key={link} size="xs">{link}</Badge>
                          ))}
                        </span>
                      ) : null}

                      <a
                        href={item.url}
                        download={item.filename}
                        aria-label={`Download ${item.filename}`}
                        className="shrink-0 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-saffron"
                      >
                        <DownloadIcon size={14} />
                      </a>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Lightbox
        images={images.map((item) => ({
          id: item.id,
          url: item.previewUrl!,
          largeUrl: item.url,
          caption: item.title,
          filename: item.filename,
          width: null,
          height: null,
          uploadedByName: item.uploadedBy,
          createdAt: item.createdAt,
          contextLabel: item.linkedTo[0] ?? null,
        }))}
        index={lightboxIndex}
        onIndexChange={setLightboxIndex}
        onClose={() => setLightboxIndex(null)}
        canEdit={false}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
