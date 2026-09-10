"use client";

/**
 * The form a guest actually fills in.
 *
 * Written for the least confident person who will open it — somebody's
 * grandmother, on a phone, once. So: one question per person in plain words,
 * big targets, no jargon, and nothing asked that we could reasonably work out
 * ourselves.
 *
 * The extra questions only appear for people who said yes. Asking somebody
 * who can't come about their dietary requirements is the kind of thing that
 * makes a form feel like paperwork.
 */

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { CheckIcon } from "@/components/ui/icons";
import { submitRsvp } from "@/server/actions/rsvp";

export interface RsvpPerson {
  guestId: string;
  firstName: string;
  name: string;
  dietary: string;
  allergies: string | null;
  accessibilityNeeds: string | null;
  needsAccommodation: boolean;
  needsTransport: boolean;
  /** Their previous answer, if they've replied before. */
  coming: "YES" | "NO" | null;
}

const DIETS: [string, string][] = [
  ["NOT_SPECIFIED", "No preference"],
  ["NON_VEGETARIAN", "Eats everything"],
  ["VEGETARIAN", "Vegetarian"],
  ["JAIN", "Jain"],
  ["VEGAN", "Vegan"],
];

export function RsvpForm({
  token,
  people: initialPeople,
  phone,
  email,
  message: initialMessage,
  alreadyReplied,
}: {
  token: string;
  people: RsvpPerson[];
  phone: string;
  email: string;
  message: string;
  alreadyReplied: boolean;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [people, setPeople] = React.useState(initialPeople);
  const [contact, setContact] = React.useState({ phone, email });
  const [message, setMessage] = React.useState(initialMessage);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ coming: number; total: number } | null>(null);

  // The formal invitation follows the same guest journey as the save-the-date:
  // once at least one person accepts, open the wedding website and its event
  // details. A decline remains on the private thank-you screen.
  React.useEffect(() => {
    if (!done || done.coming === 0) return;

    const timer = window.setTimeout(() => {
      router.push("/home?reply=received", { scroll: true });
    }, 1_300);

    return () => window.clearTimeout(timer);
  }, [done, router]);

  function update(guestId: string, patch: Partial<RsvpPerson>) {
    setPeople((current) =>
      current.map((person) => (person.guestId === guestId ? { ...person, ...patch } : person)),
    );
  }

  const unanswered = people.filter((person) => person.coming === null).length;

  async function submit() {
    if (unanswered > 0) {
      setError(
        unanswered === 1
          ? "One person still needs a yes or no."
          : `${unanswered} people still need a yes or no.`,
      );
      return;
    }

    setPending(true);
    setError(null);

    try {
      const result = await Promise.race([
        submitRsvp({
          token,
          phone: contact.phone || undefined,
          email: contact.email || undefined,
          message: message || undefined,
          people: people.map((person) => ({
            guestId: person.guestId,
            coming: person.coming,
            dietary: person.dietary,
            allergies: person.allergies ?? "",
            accessibilityNeeds: person.accessibilityNeeds ?? "",
            needsAccommodation: person.needsAccommodation,
            needsTransport: person.needsTransport,
          })),
        }),
        // Never strand somebody on "Sending…": a reply that hangs leaves them
        // unable to tell whether they have answered. Sending again is safe.
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out")), 25_000),
        ),
      ]);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone({ coming: result.coming, total: result.total });
    } catch {
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-line bg-surface p-7 text-center shadow-raised"
      >
        <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-positive-soft text-positive">
          <CheckIcon size={22} />
        </span>
        <h2 className="font-display text-[24px] text-ink">
          {done.coming > 0 ? "Wonderful — thank you" : "Thank you for letting us know"}
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-ink-soft">
          {done.coming > 0
            ? done.coming === done.total
              ? "We have you all down, and we can't wait to see you there."
              : `We have ${done.coming} of you down. We'll miss the others.`
            : "We're so sorry you can't be with us. You'll be missed."}
        </p>
        <button
          type="button"
          onClick={() => setDone(null)}
          className="mt-5 text-[12.5px] text-ink-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Change something
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {alreadyReplied ? (
        <p className="rounded-xl border border-line bg-surface-soft px-3.5 py-2.5 text-[12.5px] text-ink-muted">
          You've replied already — this is what we have. Change anything you like
          and send it again.
        </p>
      ) : null}

      <div className="space-y-3">
        {people.map((person, index) => (
          <motion.div
            key={person.guestId}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.6,
              ease: [0.22, 1, 0.36, 1],
              delay: reduce ? 0 : index * 0.07,
            }}
            className={cn(
              "rounded-2xl border p-4 transition-colors duration-500",
              person.coming === "YES"
                ? "border-positive/30 bg-positive-soft/40"
                : person.coming === "NO"
                  ? "border-line bg-surface-sunken/40"
                  : "border-line bg-surface",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[16px] text-ink">{person.name}</p>

              <div className="flex gap-2">
                <Choice
                  selected={person.coming === "YES"}
                  tone="yes"
                  onClick={() => update(person.guestId, { coming: "YES" })}
                >
                  Coming
                </Choice>
                <Choice
                  selected={person.coming === "NO"}
                  tone="no"
                  onClick={() => update(person.guestId, { coming: "NO" })}
                >
                  Can't make it
                </Choice>
              </div>
            </div>

            {/* Only asked of people who are actually coming. */}
            {person.coming === "YES" ? (
              <motion.div
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-3 border-t border-line/70 pt-4">
                  <FormField label="Anything you don't eat?" htmlFor={`d-${person.guestId}`}>
                    <div className="flex flex-wrap gap-1.5">
                      {DIETS.map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => update(person.guestId, { dietary: value })}
                          className={cn(
                            "min-h-[38px] rounded-xl border px-3 text-[13px] transition-colors",
                            person.dietary === value
                              ? "border-ink bg-ink text-canvas"
                              : "border-line text-ink-soft hover:border-line-strong",
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </FormField>

                  <FormField
                    label="Any allergies we should know about?"
                    htmlFor={`a-${person.guestId}`}
                  >
                    <Input
                      id={`a-${person.guestId}`}
                      value={person.allergies ?? ""}
                      onChange={(e) => update(person.guestId, { allergies: e.target.value })}
                      placeholder="Nuts, shellfish — or leave blank"
                    />
                  </FormField>

                  <FormField
                    label="Anything that would make the week easier?"
                    htmlFor={`n-${person.guestId}`}
                    hint="A ground-floor room, step-free access, anything at all."
                  >
                    <Input
                      id={`n-${person.guestId}`}
                      value={person.accessibilityNeeds ?? ""}
                      onChange={(e) =>
                        update(person.guestId, { accessibilityNeeds: e.target.value })
                      }
                    />
                  </FormField>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Toggle
                      on={person.needsAccommodation}
                      onClick={() =>
                        update(person.guestId, {
                          needsAccommodation: !person.needsAccommodation,
                        })
                      }
                    >
                      I need a room
                    </Toggle>
                    <Toggle
                      on={person.needsTransport}
                      onClick={() =>
                        update(person.guestId, { needsTransport: !person.needsTransport })
                      }
                    >
                      I'd like help with transport
                    </Toggle>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </motion.div>
        ))}
      </div>

      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Best number to reach you" htmlFor="rsvp-phone">
            <Input
              id="rsvp-phone"
              value={contact.phone}
              onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
              inputMode="tel"
            />
          </FormField>
          <FormField label="Email" htmlFor="rsvp-email">
            <Input
              id="rsvp-email"
              type="email"
              value={contact.email}
              onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
              inputMode="email"
            />
          </FormField>
        </div>

        <FormField label="A note for Avantika and Prateek" htmlFor="rsvp-message">
          <Textarea
            id="rsvp-message"
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Optional, and very much read."
          />
        </FormField>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-critical/20 bg-critical-soft px-3.5 py-2.5 text-[13px] text-critical"
        >
          {error}
        </p>
      ) : null}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        onClick={submit}
        disabled={pending}
      >
        {pending ? "Sending…" : alreadyReplied ? "Send the changes" : "Send our reply"}
      </Button>
    </div>
  );
}

function Choice({
  selected,
  tone,
  onClick,
  children,
}: {
  selected: boolean;
  tone: "yes" | "no";
  onClick(): void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 480, damping: 28 }}
      aria-pressed={selected}
      className={cn(
        "min-h-[42px] rounded-xl border px-4 text-[13.5px] transition-colors duration-300",
        selected && tone === "yes" && "border-positive bg-positive text-canvas",
        selected && tone === "no" && "border-ink-faint bg-ink text-canvas",
        !selected && "border-line text-ink-soft hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </motion.button>
  );
}

function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        "flex min-h-[38px] items-center gap-2 rounded-xl border px-3 text-[13px] transition-colors",
        on
          ? "border-ink bg-ink text-canvas"
          : "border-line text-ink-soft hover:border-line-strong",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded-[5px] border",
          on ? "border-canvas/40 bg-canvas/15" : "border-line-strong",
        )}
      >
        {on ? <CheckIcon size={11} /> : null}
      </span>
      {children}
    </button>
  );
}
