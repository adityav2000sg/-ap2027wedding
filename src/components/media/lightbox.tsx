"use client";

/**
 * One photo viewer for the whole product.
 *
 * Arrow keys and Escape, swipe on touch, caption editing in place, and the
 * metadata that makes an image useful rather than merely decorative.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { Badge, Button } from "@/components/ui/primitives";
import { Input } from "@/components/ui/form";
import { CloseIcon, DownloadIcon, TrashIcon } from "@/components/ui/icons";

export interface LightboxImage {
  id: string;
  url: string;
  largeUrl?: string;
  caption: string | null;
  filename: string;
  width: number | null;
  height: number | null;
  tags?: string[];
  isFavourite?: boolean;
  uploadedByName?: string | null;
  createdAt?: string | null;
  contextLabel?: string | null;
}

export function Lightbox({
  images,
  index,
  onIndexChange,
  onClose,
  onCaptionChange,
  onToggleFavourite,
  onDelete,
  canEdit = true,
}: {
  images: LightboxImage[];
  index: number | null;
  onIndexChange(index: number): void;
  onClose(): void;
  onCaptionChange?(id: string, caption: string): Promise<void> | void;
  onToggleFavourite?(id: string, next: boolean): Promise<void> | void;
  onDelete?(id: string): Promise<void> | void;
  canEdit?: boolean;
}) {
  const reduce = useReducedMotion();
  const open = index !== null && index >= 0 && index < images.length;
  const image = open ? images[index] : null;

  const [draftCaption, setDraftCaption] = React.useState("");
  const [direction, setDirection] = React.useState(0);
  const touchStart = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (image) setDraftCaption(image.caption ?? "");
  }, [image?.id, image?.caption, image]);

  const go = React.useCallback(
    (delta: number) => {
      if (index === null) return;
      const next = index + delta;
      if (next < 0 || next >= images.length) return;
      setDirection(delta);
      onIndexChange(next);
    },
    [index, images.length, onIndexChange],
  );

  React.useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (event.key === "ArrowRight") { event.preventDefault(); go(1); }
      if (event.key === "ArrowLeft") { event.preventDefault(); go(-1); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, go]);

  async function commitCaption() {
    if (!image || !onCaptionChange) return;
    if (draftCaption.trim() === (image.caption ?? "").trim()) return;
    await onCaptionChange(image.id, draftCaption.trim());
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay asChild>
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/88 backdrop-blur-md"
          />
        </DialogPrimitive.Overlay>

        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col outline-none"
          onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            if (touchStart.current === null) return;
            const delta = e.changedTouches[0].clientX - touchStart.current;
            if (Math.abs(delta) > 60) go(delta < 0 ? 1 : -1);
            touchStart.current = null;
          }}
        >
          <DialogPrimitive.Title className="sr-only">
            {image?.caption || image?.filename || "Photo"}
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Use the arrow keys to move between photos, Escape to close.
          </DialogPrimitive.Description>

          {/* Header */}
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-canvas">
            <div className="min-w-0">
              <p className="truncate text-[13px]">{image?.filename}</p>
              {images.length > 1 ? (
                <p className="tabular text-[11.5px] text-canvas/55">
                  {(index ?? 0) + 1} of {images.length}
                </p>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {onToggleFavourite && image && canEdit ? (
                <button
                  type="button"
                  onClick={() => onToggleFavourite(image.id, !image.isFavourite)}
                  aria-label={image.isFavourite ? "Remove from favourites" : "Add to favourites"}
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    image.isFavourite
                      ? "text-saffron"
                      : "text-canvas/60 hover:bg-canvas/10 hover:text-canvas",
                  )}
                >
                  <StarIcon filled={image.isFavourite} />
                </button>
              ) : null}

              {image ? (
                <a
                  href={image.largeUrl ?? image.url}
                  download={image.filename}
                  aria-label="Download"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-canvas/60 transition-colors hover:bg-canvas/10 hover:text-canvas"
                >
                  <DownloadIcon size={15} />
                </a>
              ) : null}

              {onDelete && image && canEdit ? (
                <button
                  type="button"
                  onClick={() => onDelete(image.id)}
                  aria-label="Delete photo"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-canvas/60 transition-colors hover:bg-critical/25 hover:text-white"
                >
                  <TrashIcon size={15} />
                </button>
              ) : null}

              <DialogPrimitive.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-canvas/60 transition-colors hover:bg-canvas/10 hover:text-canvas"
                >
                  <CloseIcon size={16} />
                </button>
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* Image stage */}
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
            {index !== null && index > 0 ? (
              <NavButton side="left" onClick={() => go(-1)} />
            ) : null}

            <AnimatePresence mode="wait" custom={direction} initial={false}>
              {image ? (
                <motion.img
                  key={image.id}
                  src={image.largeUrl ?? image.url}
                  alt={image.caption ?? image.filename}
                  custom={direction}
                  initial={reduce ? false : { opacity: 0, x: direction * 24, scale: 0.985 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: direction * -24, scale: 0.985 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="max-h-full max-w-full rounded-lg object-contain shadow-overlay"
                />
              ) : null}
            </AnimatePresence>

            {index !== null && index < images.length - 1 ? (
              <NavButton side="right" onClick={() => go(1)} />
            ) : null}
          </div>

          {/* Footer — caption and metadata */}
          <div className="px-4 py-3">
            <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-2">
              {onCaptionChange && canEdit ? (
                <Input
                  value={draftCaption}
                  onChange={(event) => setDraftCaption(event.target.value)}
                  onBlur={commitCaption}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") { event.preventDefault(); void commitCaption(); }
                  }}
                  placeholder="Add a caption…"
                  className="flex-1 border-canvas/20 bg-canvas/10 text-canvas placeholder:text-canvas/40"
                />
              ) : image?.caption ? (
                <p className="flex-1 text-[13.5px] text-canvas">{image.caption}</p>
              ) : null}

              {image?.contextLabel ? (
                <Badge variant="outline" size="sm" className="border-canvas/25 text-canvas/70">
                  {image.contextLabel}
                </Badge>
              ) : null}
            </div>

            {image?.uploadedByName || image?.createdAt ? (
              <p className="mx-auto mt-1.5 max-w-2xl text-[11.5px] text-canvas/45">
                {[
                  image.uploadedByName ? `Added by ${image.uploadedByName}` : null,
                  image.createdAt
                    ? new Date(image.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric",
                      })
                    : null,
                  image.width && image.height ? `${image.width}×${image.height}` : null,
                ].filter(Boolean).join(" · ")}
              </p>
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function NavButton({ side, onClick }: { side: "left" | "right"; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photo" : "Next photo"}
      className={cn(
        "absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full",
        "bg-canvas/10 text-canvas/70 backdrop-blur transition-all duration-200",
        "hover:bg-canvas/20 hover:text-canvas active:scale-95",
        side === "left" ? "left-3" : "right-3",
      )}
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d={side === "left" ? "M10 3.5L5.5 8L10 12.5" : "M6 3.5L10.5 8L6 12.5"}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

function StarIcon({ filled }: { filled?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.8z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
