"use client";

/**
 * The moodboard preview strip.
 *
 * Shows the couple's own photographs the moment they upload any. Before that it
 * shows an honest invitation to add some — never stock imagery pretending to be
 * their wedding.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Uploader } from "@/components/media/uploader";
import { useRouter } from "next/navigation";

export interface StripImage {
  id: string;
  url: string;
  caption: string | null;
  blurData: string | null;
}

export function MoodboardStrip({
  images,
  boardName,
  boardId,
  itemCount,
  canUpload,
}: {
  images: StripImage[];
  boardName: string;
  boardId: string | null;
  itemCount: number;
  canUpload: boolean;
}) {
  const reduce = useReducedMotion();
  const router = useRouter();

  if (images.length === 0) {
    return (
      <div>
        <div className="rule-heading mb-3">
          <h3 className="font-display text-[17px] text-ink">Moodboard</h3>
        </div>
        <p className="mb-3 text-[13px] leading-relaxed text-ink-muted">
          Nothing here yet. Add the images you keep sending each other — florals,
          fabrics, mandaps, table settings — and they'll start showing up across
          the whole app.
        </p>
        {canUpload && boardId ? (
          <Uploader
            compact
            moodboardId={boardId}
            label="Add inspiration"
            onUploaded={() => router.refresh()}
          />
        ) : null}
        <Link
          href="/moodboard"
          className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium text-saffron transition-all hover:gap-2"
        >
          Open moodboards <ArrowRightIcon size={12} />
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="rule-heading mb-3">
        <h3 className="font-display text-[17px] text-ink">Moodboard</h3>
      </div>

      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
        {images.slice(0, 5).map((image, index) => (
          <motion.div
            key={image.id}
            initial={reduce ? false : { opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.4,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : index * 0.05,
            }}
            className="group relative aspect-square overflow-hidden rounded-lg bg-surface-sunken"
          >
            <Link href="/moodboard" className="block h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={image.url}
                alt={image.caption ?? ""}
                loading="lazy"
                className={cn(
                  "h-full w-full object-cover",
                  "transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
                  "group-hover:scale-[1.06]",
                )}
                style={
                  image.blurData
                    ? { backgroundImage: `url(${image.blurData})`, backgroundSize: "cover" }
                    : undefined
                }
              />
            </Link>
          </motion.div>
        ))}

        {/* The tile that tells you what this is */}
        <Link
          href="/moodboard"
          className="group flex aspect-square flex-col justify-between rounded-lg border border-line bg-surface p-2.5 transition-colors hover:border-saffron/40 hover:bg-saffron-soft/40"
        >
          <div>
            <div className="text-[11.5px] font-medium leading-tight text-ink">
              {boardName}
            </div>
            <div className="tabular mt-0.5 text-[10.5px] text-ink-muted">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </div>
          </div>
          <span className="self-end text-ink-faint transition-all group-hover:translate-x-0.5 group-hover:text-saffron">
            <ArrowRightIcon size={13} />
          </span>
        </Link>
      </div>
    </div>
  );
}
