"use client";

/**
 * The save-the-date.
 *
 * A year out, this asks one question and no more: can you come, roughly. No
 * dietary requirements, no room preferences — those belong on the invitation
 * proper at the end of the year, and asking now would be asking people to
 * decide things they haven't thought about.
 *
 * The artwork is the page. It arrives rather than appearing: the gate settles
 * in from slightly too large and slightly too dark, the way a door opens onto
 * somewhere. Everything else follows it up the page in sequence, unhurried,
 * because the point of the first screen is the invitation and not the form.
 *
 * All of it is switched off wholesale for anyone who asked their system not to
 * animate things — the page still reads perfectly still.
 */

import * as React from "react";
import Image from "next/image";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/primitives";
import { FormField, Input, Textarea } from "@/components/ui/form";
import { CheckIcon } from "@/components/ui/icons";
import { submitRsvp } from "@/server/actions/rsvp";

export interface StdPerson {
  guestId: string;
  name: string;
  /** What they said last time, if they've answered before. */
  response: "YES" | "NO" | "MAYBE" | null;
}

const ANSWERS: { value: "YES" | "NO" | "MAYBE"; label: string }[] = [
  { value: "YES", label: "Wouldn't miss it" },
  { value: "MAYBE", label: "Hoping to" },
  { value: "NO", label: "Can't make it" },
];

export function SaveTheDate({
  token,
  artwork,
  music,
  householdName,
  people: initialPeople,
  phone,
  email,
  message: initialMessage,
  alreadyReplied,
  rsvpBy,
}: {
  token: string;
  artwork: string | null;
  music: string | null;
  householdName: string;
  people: StdPerson[];
  phone: string;
  email: string;
  message: string;
  alreadyReplied: boolean;
  rsvpBy: string;
}) {
  const reduce = useReducedMotion();
  const [people, setPeople] = React.useState(initialPeople);
  const [contact, setContact] = React.useState({ phone, email });
  const [message, setMessage] = React.useState(initialMessage);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ coming: number; total: number } | null>(null);

  // The artwork drifts a little slower than the page, so scrolling feels like
  // walking through the gate rather than past it.
  const { scrollY } = useScroll();
  const artY = useTransform(scrollY, [0, 700], [0, reduce ? 0 : 90]);
  const artScale = useTransform(scrollY, [0, 700], [1, reduce ? 1 : 1.06]);

  const unanswered = people.filter((person) => person.response === null).length;

  function answer(guestId: string, response: StdPerson["response"]) {
    setPeople((current) =>
      current.map((person) =>
        person.guestId === guestId ? { ...person, response } : person,
      ),
    );
  }

  async function submit() {
    if (unanswered > 0) {
      setError(
        unanswered === 1
          ? "One person still needs an answer."
          : `${unanswered} people still need an answer.`,
      );
      return;
    }

    setPending(true);
    setError(null);

    const result = await submitRsvp({
      token,
      phone: contact.phone || undefined,
      email: contact.email || undefined,
      message: message || undefined,
      people: people.map((person) => ({
        guestId: person.guestId,
        coming: person.response,
      })),
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone({ coming: result.coming, total: result.total });
  }

  return (
    <main className="min-h-dvh bg-[#eef2ee]">
      {music ? <Music src={music} /> : null}

      {/* The artwork, arriving. */}
      <div className="relative mx-auto max-w-[720px] px-4 pt-4 sm:pt-8">
        {artwork ? (
          <motion.div
            style={reduce ? undefined : { y: artY, scale: artScale }}
            initial={reduce ? false : { opacity: 0, scale: 1.06, filter: "brightness(0.72)" }}
            animate={{ opacity: 1, scale: 1, filter: "brightness(1)" }}
            transition={{ duration: 1.8, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden rounded-2xl shadow-[0_24px_70px_-30px_rgba(31,58,45,0.5)]"
          >
            <Image
              src={artwork}
              alt="Save the date for the wedding of Avantika and Prateek"
              width={1200}
              height={1700}
              priority
              className="h-auto w-full"
            />
          </motion.div>
        ) : null}
      </div>

      <div className="relative mx-auto max-w-[560px] px-5 pb-16 pt-10 sm:pt-14">
        {done ? (
          <Thanks
            coming={done.coming}
            total={done.total}
            onChange={() => setDone(null)}
          />
        ) : (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 1,
              ease: [0.22, 1, 0.36, 1],
              // After the artwork has settled.
              delay: reduce ? 0 : 0.9,
            }}
          >
            <div className="text-center">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[#5d7d68]">
                {householdName}
              </p>
              <h2 className="mt-3 font-script text-[38px] leading-tight text-[#2c3d33] sm:text-[46px]">
                Will you be there?
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-[14px] leading-relaxed text-[#5d7d68]">
                Nothing binding — we're only trying to get a sense of numbers.
                The invitation proper follows later this year.
              </p>
            </div>

            {alreadyReplied ? (
              <p className="mt-6 rounded-xl border border-[#c8d8cc] bg-white/60 px-3.5 py-2.5 text-center text-[12.5px] text-[#5d7d68]">
                You've answered already — change anything you like and send it again.
              </p>
            ) : null}

            <div className="mt-8 space-y-3">
              {people.map((person, index) => (
                <motion.div
                  key={person.guestId}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.7,
                    ease: [0.22, 1, 0.36, 1],
                    delay: reduce ? 0 : 1 + index * 0.08,
                  }}
                  className="rounded-2xl border border-[#c8d8cc] bg-white/70 p-4 backdrop-blur-sm"
                >
                  <p className="text-[16px] text-[#2c3d33]">{person.name}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ANSWERS.map((option) => (
                      <Choice
                        key={option.value}
                        selected={person.response === option.value}
                        onClick={() => answer(person.guestId, option.value)}
                      >
                        {option.label}
                      </Choice>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-4 space-y-3 rounded-2xl border border-[#c8d8cc] bg-white/70 p-4 backdrop-blur-sm">
              <p className="text-[12.5px] text-[#5d7d68]">
                So we can send the invitation to the right place.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Phone" htmlFor="std-phone">
                  <Input
                    id="std-phone"
                    value={contact.phone}
                    onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))}
                    inputMode="tel"
                  />
                </FormField>
                <FormField label="Email" htmlFor="std-email">
                  <Input
                    id="std-email"
                    type="email"
                    value={contact.email}
                    onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                    inputMode="email"
                  />
                </FormField>
              </div>

              <FormField label="A note, if you like" htmlFor="std-message">
                <Textarea
                  id="std-message"
                  rows={2}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Optional, and very much read."
                />
              </FormField>
            </div>

            {error ? (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-critical/25 bg-critical-soft px-3.5 py-2.5 text-[13px] text-critical"
              >
                {error}
              </p>
            ) : null}

            <Button
              variant="primary"
              size="lg"
              className="mt-5 w-full"
              onClick={submit}
              disabled={pending}
            >
              {pending ? "Sending…" : alreadyReplied ? "Send the changes" : "Let them know"}
            </Button>

            <p className="mt-6 text-center text-[11.5px] text-[#7d9585]">
              Kindly reply by {rsvpBy}. This link is just for {householdName}.
            </p>
          </motion.div>
        )}
      </div>
    </main>
  );
}

function Thanks({
  coming,
  total,
  onChange,
}: {
  coming: number;
  total: number;
  onChange(): void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl border border-[#c8d8cc] bg-white/75 p-8 text-center backdrop-blur-sm"
    >
      <span className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#dcebe0] text-[#3f6b4f]">
        <CheckIcon size={22} />
      </span>
      <h2 className="font-script text-[34px] text-[#2c3d33]">
        {coming > 0 ? "Wonderful" : "Thank you for telling us"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[14px] leading-relaxed text-[#5d7d68]">
        {coming > 0
          ? coming === total
            ? "We have you all pencilled in. The invitation follows later this year."
            : `We have ${coming} of you pencilled in. The invitation follows later this year.`
          : "We're so sorry you can't be with us. You'll be missed."}
      </p>
      <button
        type="button"
        onClick={onChange}
        className="mt-5 text-[12.5px] text-[#7d9585] underline-offset-2 hover:text-[#2c3d33] hover:underline"
      >
        Change something
      </button>
    </motion.div>
  );
}

function Choice({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 460, damping: 28 }}
      aria-pressed={selected}
      className={cn(
        "min-h-[44px] flex-1 rounded-xl border px-3 text-[13.5px] transition-colors duration-300",
        selected
          ? "border-[#3f6b4f] bg-[#3f6b4f] text-white"
          : "border-[#c8d8cc] bg-white/60 text-[#4a6553] hover:border-[#9dbaa6]",
      )}
    >
      {children}
    </motion.button>
  );
}

/**
 * Music, off by default and obvious to turn on.
 *
 * Every browser blocks audio that starts by itself, so autoplay wouldn't work
 * even if it were a kind thing to do to somebody opening this in an office. It
 * fades in and out rather than cutting.
 */
function Music({ src }: { src: string }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);

  async function toggle() {
    const audio = ref.current;
    if (!audio) return;

    if (playing) {
      // Fade down rather than stopping dead.
      const fade = setInterval(() => {
        if (audio.volume > 0.06) audio.volume -= 0.06;
        else {
          audio.pause();
          clearInterval(fade);
        }
      }, 60);
      setPlaying(false);
      return;
    }

    audio.volume = 0;
    audio.loop = true;
    try {
      await audio.play();
    } catch {
      return; // Blocked or unsupported; the page is fine without it.
    }
    setPlaying(true);
    const fade = setInterval(() => {
      if (audio.volume < 0.34) audio.volume += 0.04;
      else clearInterval(fade);
    }, 90);
  }

  return (
    <>
      <audio ref={ref} src={src} preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Turn the music off" : "Play music"}
        className="fixed right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-[#c8d8cc] bg-white/80 text-[#4a6553] backdrop-blur-sm transition-colors hover:bg-white"
      >
        {playing ? (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <rect x="3.5" y="3" width="3" height="10" rx="1" />
            <rect x="9.5" y="3" width="3" height="10" rx="1" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
            <path d="M6 3.4v9.2l6-4.6z" fill="currentColor" />
          </svg>
        )}
      </button>
    </>
  );
}
