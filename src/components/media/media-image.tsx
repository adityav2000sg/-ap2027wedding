"use client";

/**
 * A photograph, and what to show when there isn't one.
 *
 * An upload is two halves — a row in Postgres and bytes on a disk — and only
 * the row is durable. If the bytes go missing the row still says there's a
 * picture, so every surface in the app confidently renders an `<img>` at a URL
 * that 404s, and the browser draws its own torn-page glyph. On a moodboard tile
 * that already carries a blur placeholder the result is worse than nothing: a
 * blurred smear with a broken icon sitting on top of it, which reads as the app
 * being broken rather than the file being gone.
 *
 * So: when the fetch fails, say so quietly and in the app's own voice. The tile
 * keeps its shape, the layout doesn't move, and the blur is dropped — a blur
 * with nothing behind it is a promise the page can't keep.
 *
 * `/api/health?storage=1` answers why, for the whole library at once.
 */

import * as React from "react";

import { cn } from "@/lib/cn";
import { ImageIcon } from "@/components/ui/icons";

export function MediaImage({
  src,
  alt,
  blurData,
  className,
  loading = "lazy",
  /** Shown instead of the icon when there's room for words. */
  fallbackLabel,
  style,
  ...rest
}: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  src: string;
  alt: string;
  blurData?: string | null;
  fallbackLabel?: string;
}) {
  const [failed, setFailed] = React.useState(false);

  // A new src is a new chance: without this, a re-render that swaps the image
  // would keep showing the previous one's failure.
  React.useEffect(() => setFailed(false), [src]);

  if (failed) {
    return (
      <span
        className={cn(
          // A min-height of its own: some of these tiles are masonry cells that
          // take their height from the picture, and would otherwise collapse to
          // a sliver the moment there's no picture to take it from.
          "flex min-h-[56px] flex-col items-center justify-center gap-1 bg-surface-sunken text-ink-faint",
          className,
        )}
        title="This image is missing from the server"
        role="img"
        aria-label={alt ? `${alt} — image unavailable` : "Image unavailable"}
      >
        <ImageIcon size={16} />
        {fallbackLabel ? (
          <span className="px-1 text-center text-[10px] leading-tight">{fallbackLabel}</span>
        ) : null}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={src}
      alt={alt}
      loading={loading}
      onError={() => setFailed(true)}
      className={className}
      style={
        blurData
          ? { backgroundImage: `url(${blurData})`, backgroundSize: "cover", ...style }
          : style
      }
    />
  );
}
