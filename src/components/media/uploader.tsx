"use client";

/**
 * The one upload component.
 *
 * Click, drag-drop or paste. Real progress comes from XHR rather than fetch,
 * because fetch can't report upload progress — and a progress bar that isn't
 * measuring anything is a lie.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { CheckIcon, CloseIcon, UploadIcon } from "@/components/ui/icons";

export interface UploadedMedia {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  kind: string;
  url: string;
  thumbUrl: string;
  gridUrl: string;
}

interface QueueItem {
  localId: string;
  file: File;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  xhr?: XMLHttpRequest;
}

export function Uploader({
  entityType,
  entityId,
  role = "reference",
  moodboardId,
  accept = "image/*",
  multiple = true,
  label = "Add photos",
  hint,
  compact,
  className,
  onUploaded,
}: {
  entityType?: string;
  entityId?: string;
  role?: string;
  moodboardId?: string;
  accept?: string;
  multiple?: boolean;
  label?: string;
  hint?: React.ReactNode;
  compact?: boolean;
  className?: string;
  onUploaded?(media: UploadedMedia[]): void;
}) {
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const reduce = useReducedMotion();
  const dragDepth = React.useRef(0);

  const upload = React.useCallback(
    (files: File[]) => {
      if (files.length === 0) return;

      const items: QueueItem[] = files.map((file) => ({
        localId: `${file.name}-${file.size}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        progress: 0,
        status: "uploading",
      }));
      setQueue((current) => [...current, ...items]);

      for (const item of items) {
        const form = new FormData();
        form.append("files", item.file);
        if (entityType) form.append("entityType", entityType);
        if (entityId) form.append("entityId", entityId);
        if (role) form.append("role", role);
        if (moodboardId) form.append("moodboardId", moodboardId);

        const xhr = new XMLHttpRequest();
        item.xhr = xhr;
        xhr.open("POST", "/api/media/upload");

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const progress = Math.round((event.loaded / event.total) * 100);
          setQueue((current) =>
            current.map((q) =>
              q.localId === item.localId ? { ...q, progress } : q,
            ),
          );
        };

        xhr.onload = () => {
          let payload: { uploaded?: UploadedMedia[]; failed?: { error: string }[]; error?: string } = {};
          try {
            payload = JSON.parse(xhr.responseText);
          } catch {
            /* fall through to the generic error below */
          }

          const uploaded = payload.uploaded ?? [];
          const failure = payload.failed?.[0]?.error ?? payload.error;

          if (xhr.status >= 200 && xhr.status < 300 && uploaded.length > 0) {
            setQueue((current) =>
              current.map((q) =>
                q.localId === item.localId ? { ...q, progress: 100, status: "done" } : q,
              ),
            );
            onUploaded?.(uploaded);
            // Leave the tile up briefly so the completion is visible.
            setTimeout(() => {
              setQueue((current) => current.filter((q) => q.localId !== item.localId));
              if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
            }, 1400);
          } else {
            setQueue((current) =>
              current.map((q) =>
                q.localId === item.localId
                  ? { ...q, status: "error", error: failure ?? "Upload failed." }
                  : q,
              ),
            );
          }
        };

        xhr.onerror = () => {
          setQueue((current) =>
            current.map((q) =>
              q.localId === item.localId
                ? { ...q, status: "error", error: "Connection lost during upload." }
                : q,
            ),
          );
        };

        xhr.onabort = () => {
          setQueue((current) => current.filter((q) => q.localId !== item.localId));
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        };

        xhr.send(form);
      }
    },
    [entityType, entityId, role, moodboardId, onUploaded],
  );

  // Paste-to-upload, scoped to when this uploader is on screen.
  React.useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      event.preventDefault();
      upload(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    upload(Array.from(event.dataTransfer.files));
  }

  return (
    <div className={className}>
      <div
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          event.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) setDragging(false);
        }}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center",
          "transition-colors duration-200 transition-natural",
          compact ? "gap-1 px-3 py-4" : "gap-1.5 px-5 py-8",
          dragging
            ? "border-saffron bg-saffron-soft"
            : "border-line-strong bg-surface-soft hover:border-saffron/50 hover:bg-surface-sunken",
        )}
      >
        <motion.span
          animate={dragging && !reduce ? { y: -3, scale: 1.08 } : { y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 24 }}
          className={cn(
            "flex items-center justify-center rounded-full",
            compact ? "h-7 w-7" : "h-9 w-9",
            dragging ? "bg-saffron text-white" : "bg-surface-sunken text-ink-muted",
          )}
        >
          <UploadIcon size={compact ? 13 : 16} />
        </motion.span>
        <span className={cn("font-medium text-ink", compact ? "text-[12.5px]" : "text-[13.5px]")}>
          {dragging ? "Drop to upload" : label}
        </span>
        {!compact ? (
          <span className="text-[11.5px] text-ink-muted">
            {hint ?? "Drag files here, click to browse, or paste from your clipboard"}
          </span>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="sr-only"
          onChange={(event) => {
            upload(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>

      <AnimatePresence initial={false}>
        {queue.length > 0 ? (
          <motion.ul
            initial={reduce ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="mt-2 space-y-1.5 overflow-hidden"
          >
            <AnimatePresence initial={false}>
              {queue.map((item) => (
                <motion.li
                  key={item.localId}
                  layout
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2"
                >
                  {item.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-surface-sunken text-[9px] font-semibold uppercase text-ink-muted">
                      {item.file.name.split(".").pop()?.slice(0, 4)}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12.5px] text-ink">
                        {item.file.name}
                      </span>
                      <span className="tabular shrink-0 text-[11px] text-ink-faint">
                        {formatBytes(item.file.size)}
                      </span>
                    </div>

                    {item.status === "error" ? (
                      <p className="mt-0.5 text-[11.5px] text-critical">{item.error}</p>
                    ) : (
                      <div className="mt-1 h-[3px] w-full overflow-hidden rounded-full bg-surface-sunken">
                        <motion.div
                          className={cn(
                            "h-full rounded-full",
                            item.status === "done" ? "bg-positive" : "bg-saffron",
                          )}
                          initial={{ width: 0 }}
                          animate={{ width: `${item.progress}%` }}
                          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                    )}
                  </div>

                  {item.status === "done" ? (
                    <motion.span
                      initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 20 }}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive text-white"
                    >
                      <CheckIcon size={11} />
                    </motion.span>
                  ) : item.status === "uploading" ? (
                    <Button
                      variant="quiet"
                      size="iconSm"
                      aria-label={`Cancel upload of ${item.file.name}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        item.xhr?.abort();
                      }}
                    >
                      <CloseIcon size={12} />
                    </Button>
                  ) : (
                    <Button
                      variant="quiet"
                      size="iconSm"
                      aria-label="Dismiss"
                      onClick={(event) => {
                        event.stopPropagation();
                        setQueue((current) =>
                          current.filter((q) => q.localId !== item.localId),
                        );
                      }}
                    >
                      <CloseIcon size={12} />
                    </Button>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
