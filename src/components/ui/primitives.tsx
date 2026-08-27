/**
 * Core UI primitives.
 *
 * Deliberately small and unopinionated — the design language lives in
 * `globals.css`, so these mostly compose tokens rather than invent styling.
 */

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn, initials, toneClasses } from "@/lib/cn";
import type { Severity } from "@/domain/types";

// ─────────────────────────────────────────────────────────────────── Surfaces

export function Card({
  className,
  raised,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn(raised ? "surface-raised" : "surface", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  eyebrow,
  action,
  description,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4 pb-3", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
        <h3 className="text-[15px] leading-tight font-medium text-ink">{title}</h3>
        {description ? (
          <p className="mt-1 text-[13px] text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────── Button

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium " +
    "transition-all duration-150 transition-natural select-none " +
    "disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary:
          "bg-ink text-canvas hover:bg-ink/88 active:scale-[0.985] shadow-flat",
        accent:
          "bg-saffron text-white hover:bg-saffron/90 active:scale-[0.985] shadow-flat",
        secondary:
          "bg-surface border border-line text-ink hover:bg-surface-sunken hover:border-line-strong active:scale-[0.985]",
        ghost: "text-ink-soft hover:bg-surface-sunken hover:text-ink active:scale-[0.97]",
        quiet: "text-ink-muted hover:text-ink hover:bg-surface-sunken active:scale-[0.97]",
        danger:
          "bg-critical text-white hover:bg-critical/90 active:scale-[0.985]",
        dangerGhost: "text-critical hover:bg-critical-soft active:scale-[0.97]",
      },
      size: {
        xs: "h-7 px-2 text-[12px]",
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-3.5 text-[13px]",
        lg: "h-10 px-4 text-[14px]",
        icon: "h-8 w-8",
        iconSm: "h-7 w-7",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

// ───────────────────────────────────────────────────────────────────── Badge

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "bg-surface-sunken text-ink-soft border border-line",
        solid: "bg-ink text-canvas",
        outline: "border border-line-strong text-ink-soft",
        critical: "bg-critical-soft text-critical border border-critical/20",
        important: "bg-important-soft text-important border border-important/20",
        attention: "bg-attention-soft text-attention border border-attention/20",
        info: "bg-info-soft text-info border border-info/20",
        positive: "bg-positive-soft text-positive border border-positive/20",
      },
      size: {
        xs: "h-[18px] px-1.5 text-[10.5px]",
        sm: "h-[22px] px-2 text-[11.5px]",
        md: "h-6 px-2.5 text-[12px]",
      },
    },
    defaultVariants: { variant: "neutral", size: "sm" },
  },
);

export function Badge({
  className,
  variant,
  size,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

/** A badge coloured by a tone token rather than by severity. */
export function ToneBadge({
  tone,
  className,
  children,
  size = "sm",
}: {
  tone: string | null | undefined;
  className?: string;
  children: React.ReactNode;
  size?: "xs" | "sm" | "md";
}) {
  const classes = toneClasses(tone);
  return (
    <span
      className={cn(
        badgeVariants({ size }),
        "border",
        classes.bg,
        classes.text,
        classes.border,
        className,
      )}
    >
      {children}
    </span>
  );
}

export const SEVERITY_VARIANT: Record<Severity, "critical" | "important" | "attention" | "info"> = {
  critical: "critical",
  important: "important",
  attention: "attention",
  info: "info",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  important: "Important",
  attention: "Needs attention",
  info: "For information",
};

// ──────────────────────────────────────────────────────────────────── Avatar

export function Avatar({
  name,
  tone,
  size = "md",
  className,
}: {
  name: string;
  tone?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const classes = toneClasses(tone);
  const dimensions = {
    xs: "h-5 w-5 text-[9px]",
    sm: "h-6 w-6 text-[10px]",
    md: "h-7 w-7 text-[11px]",
    lg: "h-10 w-10 text-[13px]",
  }[size];

  return (
    <span
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        "border",
        classes.bg,
        classes.text,
        classes.border,
        dimensions,
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping avatar stack, used on task rows and event cards. */
export function AvatarStack({
  people,
  max = 3,
}: {
  people: { name: string; tone?: string | null }[];
  max?: number;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((person, i) => (
        <Avatar
          key={`${person.name}-${i}`}
          name={person.name}
          tone={person.tone}
          size="sm"
          className="ring-2 ring-surface"
        />
      ))}
      {extra > 0 ? (
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-line bg-surface-sunken text-[10px] font-semibold text-ink-muted ring-2 ring-surface">
          +{extra}
        </span>
      ) : null}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────── Meter

/** A slim horizontal progress bar. */
export function Meter({
  value,
  tone = "saffron",
  className,
  height = 6,
}: {
  /** 0–100 */
  value: number;
  tone?: string | null;
  className?: string;
  height?: number;
}) {
  const classes = toneClasses(tone);
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-surface-sunken", className)}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500 transition-natural", classes.dot)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/**
 * A multi-segment bar — used for RSVP breakdowns and budget composition, where
 * one bar tells the whole story better than three separate numbers.
 */
export function SegmentBar({
  segments,
  height = 8,
  className,
}: {
  segments: { value: number; tone: string; label: string }[];
  height?: number;
  className?: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <div
        className={cn("w-full rounded-full bg-surface-sunken", className)}
        style={{ height }}
      />
    );
  }
  return (
    <div
      className={cn("flex w-full overflow-hidden rounded-full bg-surface-sunken", className)}
      style={{ height }}
    >
      {segments
        .filter((s) => s.value > 0)
        .map((segment, i) => (
          <div
            key={i}
            title={`${segment.label}: ${segment.value}`}
            className={cn(toneClasses(segment.tone).dot, "transition-all duration-500 transition-natural")}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────── Feedback

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  /** Should teach, not just state the absence. */
  description: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-sunken text-ink-faint">
          {icon}
        </div>
      ) : null}
      <h4 className="font-display text-[17px] text-ink">{title}</h4>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-ink-muted">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}

// ──────────────────────────────────────────────────────────── Layout helpers

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? <div className="eyebrow mb-1.5">{eyebrow}</div> : null}
          <h1 className="font-display text-[26px] leading-tight text-ink sm:text-[30px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-1 text-[13.5px] text-ink-muted">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Label/value pair used throughout detail panels. */
export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[11.5px] font-medium tracking-wide text-ink-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-[13.5px] text-ink">{children}</dd>
    </div>
  );
}

export function Separator({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-line", className)} />;
}

/** Standard "nothing here" dash, so blank cells read as intentional. */
export function Blank() {
  return <span className="text-ink-faint">—</span>;
}
