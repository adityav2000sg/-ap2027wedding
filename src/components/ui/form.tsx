"use client";

/**
 * Form controls.
 *
 * Native elements wherever possible — they're accessible, keyboard-friendly and
 * work on mobile without help. Radix only where native has no good answer.
 */

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/cn";

const FIELD_BASE =
  "w-full rounded-lg border border-line bg-surface px-3 text-[13.5px] text-ink " +
  "placeholder:text-ink-faint transition-colors duration-150 " +
  "hover:border-line-strong focus:border-saffron focus:outline-none " +
  "focus:ring-2 focus:ring-saffron/20 disabled:opacity-50 disabled:bg-surface-sunken";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(FIELD_BASE, "h-9", className)} {...props} />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(FIELD_BASE, "min-h-[76px] resize-y py-2 leading-relaxed", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(FIELD_BASE, "h-9 appearance-none pr-8", className)}
      {...props}
    >
      {children}
    </select>
    <svg
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted"
      width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
    >
      <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
));
Select.displayName = "Select";

/** Label + control + error, the standard vertical stack. */
export function FormField({
  label,
  hint,
  error,
  children,
  required,
  className,
  htmlFor,
}: {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  required?: boolean;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="flex items-baseline gap-1 text-[12.5px] font-medium text-ink-soft"
      >
        {label}
        {required ? <span className="text-critical">*</span> : null}
      </label>
      {children}
      {error ? (
        <p className="text-[12px] text-critical" role="alert">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-ink-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
  id,
}: {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const generated = React.useId();
  const inputId = id ?? generated;

  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <CheckboxPrimitive.Root
        id={inputId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className={cn(
          "mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px]",
          "border border-line-strong bg-surface transition-all duration-150",
          "hover:border-saffron/60 disabled:opacity-50",
          "data-[state=checked]:border-saffron data-[state=checked]:bg-saffron",
        )}
      >
        <CheckboxPrimitive.Indicator className="text-white">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden>
            <path d="M2 5.5L4.5 8L9 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      {label ? (
        <label htmlFor={inputId} className="cursor-pointer select-none">
          <span className="block text-[13.5px] leading-snug text-ink">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-[12px] text-ink-muted">{description}</span>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onCheckedChange(checked: boolean): void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start justify-between gap-4">
      {label ? (
        <label htmlFor={id} className="cursor-pointer select-none">
          <span className="block text-[13.5px] text-ink">{label}</span>
          {description ? (
            <span className="mt-0.5 block text-[12px] text-ink-muted">{description}</span>
          ) : null}
        </label>
      ) : null}
      <SwitchPrimitive.Root
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={cn(
          "relative h-[22px] w-[38px] shrink-0 rounded-full border border-line-strong",
          "bg-surface-sunken transition-colors duration-200 disabled:opacity-50",
          "data-[state=checked]:border-saffron data-[state=checked]:bg-saffron",
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "block h-[16px] w-[16px] translate-x-[2px] rounded-full bg-white shadow-flat",
            "transition-transform duration-200 transition-natural",
            "data-[state=checked]:translate-x-[19px]",
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}

/** Segmented control for small mutually-exclusive choices. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange(value: T): void;
  options: { value: T; label: React.ReactNode; count?: number }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-sunken p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] font-medium transition-all duration-150",
              size === "sm" ? "h-6 px-2 text-[12px]" : "h-7 px-2.5 text-[12.5px]",
              active
                ? "bg-surface text-ink shadow-flat"
                : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className={cn("tabular text-[11px]", active ? "text-ink-muted" : "text-ink-faint")}>
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Inline-editable text. Click to edit, Enter to save, Escape to cancel — the
 * brief's "prefer inline editing over full-page forms" made concrete.
 */
export function InlineEdit({
  value,
  onSave,
  placeholder = "Add…",
  className,
  multiline,
  disabled,
}: {
  value: string;
  onSave(value: string): void | Promise<void>;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setDraft(value), [value]);

  async function commit() {
    setEditing(false);
    if (draft.trim() === value.trim()) return;
    setSaving(true);
    try {
      await onSave(draft.trim());
    } finally {
      setSaving(false);
    }
  }

  if (disabled) {
    return (
      <span className={cn("text-[13.5px]", value ? "text-ink" : "text-ink-faint", className)}>
        {value || placeholder}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "-mx-1.5 -my-0.5 rounded px-1.5 py-0.5 text-left text-[13.5px] transition-colors",
          "hover:bg-surface-sunken",
          value ? "text-ink" : "text-ink-faint",
          saving && "opacity-50",
          className,
        )}
      >
        {value || placeholder}
      </button>
    );
  }

  const shared = {
    autoFocus: true,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: commit,
    className: cn(FIELD_BASE, className),
  };

  return multiline ? (
    <Textarea
      {...shared}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
      }}
    />
  ) : (
    <Input
      {...shared}
      onKeyDown={(e) => {
        if (e.key === "Escape") { setDraft(value); setEditing(false); }
        if (e.key === "Enter") void commit();
      }}
    />
  );
}
