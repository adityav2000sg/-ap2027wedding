"use client";

/**
 * The save-the-date.
 *
 * The opening follows the original photographic invitation the couple chose,
 * with the save-the-date reply treated as a quieter piece of stationery below.
 *
 * One question, two answers. A year out, "roughly, can you come" is the only
 * thing worth asking; dietary requirements and room preferences belong on the
 * invitation proper at the end of the year.
 *
 * The one thing we do need from anybody saying yes is a way to reach them, so
 * that appears as a second step inside their own row the moment they answer —
 * not a page later, and never asked of somebody who can't come.
 *
 * Motion is restrained and switched off for anyone whose system asks for less.
 */

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";
import { submitRsvp } from "@/server/actions/rsvp";

export interface StdPerson {
  guestId: string;
  name: string;
  response: "YES" | "NO" | null;
  /** Their own details — everyone coming answers for themselves. */
  phone: string;
  email: string;
}

export function SaveTheDate({
  token,
  photo,
  music,
  people: initialPeople,
  message: initialMessage,
  alreadyReplied,
  rsvpBy,
  rsvpByDays,
  partnerA,
  partnerB,
  date,
  location,
  days,
}: {
  token: string;
  photo: string | null;
  music: string | null;
  people: StdPerson[];
  message: string;
  alreadyReplied: boolean;
  rsvpBy: string;
  /** Days left to answer. Nothing concentrates the mind like a number. */
  rsvpByDays: number;
  partnerA: string;
  partnerB: string;
  date: string;
  location: string;
  days: number;
}) {
  const reduce = useReducedMotion();
  const [people, setPeople] = React.useState(initialPeople);
  const [message, setMessage] = React.useState(initialMessage);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ coming: number; total: number } | null>(null);

  const unanswered = people.filter((person) => person.response === null).length;
  const yesCount = people.filter((person) => person.response === "YES").length;
  const onePerson = people.length === 1;
  const submitLabel = pending
    ? "Sending…"
    : alreadyReplied
      ? onePerson
        ? "Update my reply"
        : "Update our reply"
      : yesCount > 0
        ? onePerson
          ? "Count me in"
          : "Count us in"
        : onePerson
          ? "Send my reply"
          : "Send our reply";

  function update(guestId: string, patch: Partial<StdPerson>) {
    setPeople((current) =>
      current.map((person) =>
        person.guestId === guestId ? { ...person, ...patch } : person,
      ),
    );
    setError(null);
  }

  function answer(guestId: string, response: "YES" | "NO") {
    update(guestId, { response });
  }

  async function submit() {
    if (unanswered > 0) {
      setError(
        unanswered === 1
          ? "One name still needs an answer."
          : `${unanswered} names still need an answer.`,
      );
      return;
    }

    // A number is the only thing we ask of anybody coming — everything else
    // about the week gets sent to it.
    const missingNumber = people.find(
      (person) => person.response === "YES" && person.phone.trim().length < 5,
    );
    if (missingNumber) {
      setError(
        onePerson
          ? "We just need a number to reach you on."
          : `We need a number for ${missingNumber.name}.`,
      );
      return;
    }

    const badEmail = people.find(
      (person) =>
        person.response === "YES" &&
        person.email.trim() !== "" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email.trim()),
    );
    if (badEmail) {
      setError(
        onePerson
          ? "That email address doesn't look right — or leave it blank."
          : `${badEmail.name}'s email address doesn't look right — or leave it blank.`,
      );
      return;
    }

    setPending(true);
    setError(null);

    const result = await submitRsvp({
      token,
      message: message || undefined,
      people: people.map((person) => ({
        guestId: person.guestId,
        coming: person.response,
        phone: person.phone.trim() || undefined,
        email: person.email.trim() || undefined,
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
    <main className="min-h-dvh bg-[#f6f1e9] text-[#282a25]">
      {music ? <Music src={music} /> : null}

      <header className="relative flex h-[72svh] min-h-[520px] max-h-[720px] items-center justify-center overflow-hidden sm:min-h-[560px] lg:h-[58svh]">
        {photo ? (
          <Image
            src={photo}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-[62%_center]"
          />
        ) : null}
        <div aria-hidden className="absolute inset-0 bg-[#1b1713]/42" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#15110e]/48 via-[#1b1713]/18 to-[#15110e]/72"
        />

        <div className="relative mx-auto w-full max-w-[1120px] px-5 py-20 text-center text-white">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span aria-hidden className="h-px w-8 bg-[#d99778]" />
            <p className="text-[15px] font-medium uppercase tracking-[0.18em] text-white/78">
              You are invited to the wedding of
            </p>
            <span aria-hidden className="h-px w-8 bg-[#d99778]" />
          </div>
          <h1 className="whitespace-nowrap font-script text-[clamp(35px,10.7vw,46px)] leading-none text-white drop-shadow-[0_3px_22px_rgba(0,0,0,0.38)] sm:text-[64px] md:text-[82px] lg:text-[104px]">
            {partnerA}
            <span className="mx-1.5 text-[#e0a084] sm:mx-3 lg:mx-5">&</span>
            {partnerB}
          </h1>
          <p className="mt-8 text-[16px] tracking-[0.02em] text-white/90 sm:text-[17px]">
            {date}
            <span className="mx-3 text-white/45">·</span>
            {location}
          </p>
          {days > 0 ? (
            <p className="mt-2 text-[15px] text-white/68">{days} days to go</p>
          ) : null}
        </div>

        <a
          href="#reply"
          className="absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 text-[15px] text-white/70 transition-colors hover:text-white"
        >
          Kindly reply by {rsvpBy}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 3v9M4.5 8.7 8 12.2l3.5-3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </header>

      <section id="reply" className="scroll-mt-4 px-4 py-14 sm:px-6 sm:py-20 lg:py-24">
        <div className="mx-auto max-w-[880px]">
          <AnimatePresence mode="wait">
            {done ? (
              <Thanks
                key="thanks"
                coming={done.coming}
                total={done.total}
                partnerA={partnerA}
                partnerB={partnerB}
                onChange={() => setDone(null)}
              />
            ) : (
              <motion.div
                key="form"
                initial={false}
                exit={reduce ? undefined : { opacity: 0, y: -12 }}
              >
                <header className="mx-auto mb-9 max-w-[620px] text-center sm:mb-11">
                  <p className="text-[15px] font-medium uppercase tracking-[0.18em] text-[#8b7465]">
                    Your reply
                  </p>
                  <h2 className="mt-2 font-script text-[50px] leading-none text-[#2d332d] sm:text-[66px]">
                    Will you join us in Bali?
                  </h2>
                  <p className="mt-4 text-[16px] leading-relaxed text-[#716f68]">
                    {onePerson
                      ? "We would love to celebrate with you. Please let us know if you can join us."
                      : "We would love to celebrate with you. Please reply for each person listed below."}
                  </p>
                </header>

                <ReplyBy date={rsvpBy} days={rsvpByDays} />

                {alreadyReplied ? (
                  <p className="mb-5 rounded-2xl border border-[#ccd8ce] bg-[#edf3ed] px-5 py-3.5 text-center text-[15px] text-[#4d6654]">
                    You’ve replied already. Change anything below and send it again.
                  </p>
                ) : null}

                <div className="space-y-3">
                  {people.map((person) => (
                    <div
                      key={person.guestId}
                      className={cn(
                        "grid gap-4 rounded-[22px] border px-5 py-5 shadow-[0_18px_50px_-42px_rgba(43,45,39,0.45)] transition-colors sm:grid-cols-[minmax(190px,1fr)_minmax(330px,auto)] sm:items-center sm:px-6",
                        person.response === "YES"
                          ? "border-[#b9cbbd] bg-[#f4f8f3]"
                          : person.response === "NO"
                            ? "border-[#dccfc4] bg-[#faf5f0]"
                            : "border-[#ddd8cf] bg-white/88",
                      )}
                    >
                      <p className="font-display text-[21px] leading-tight text-[#2d332d]">
                        {person.name}
                      </p>
                      <div className="grid grid-cols-2 gap-2.5">
                        <Answer
                          selected={person.response === "YES"}
                          tone="yes"
                          onClick={() => answer(person.guestId, "YES")}
                        >
                          Coming
                        </Answer>
                        <Answer
                          selected={person.response === "NO"}
                          tone="no"
                          onClick={() => answer(person.guestId, "NO")}
                        >
                          Can’t make it
                        </Answer>
                      </div>

                      {/* Step two, on the same row: asked only of the people
                          who are actually coming, and only once they've said
                          so. Everyone answers for themselves, so a couple
                          sharing a room still gives us two numbers. */}
                      <AnimatePresence initial={false}>
                        {person.response === "YES" ? (
                          <motion.div
                            key="details"
                            initial={reduce ? false : { opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={reduce ? undefined : { opacity: 0, height: 0 }}
                            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                            className="overflow-hidden sm:col-span-2"
                          >
                            <div className="border-t border-[#cbdccf] pt-4 sm:mt-1">
                              <p className="mb-3 text-[15px] text-[#5c7666]">
                                {onePerson
                                  ? "Wonderful. Where can we reach you?"
                                  : `Wonderful. Where can we reach ${person.name.split(" ")[0]}?`}
                              </p>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                  label="Mobile number"
                                  value={person.phone}
                                  onChange={(value) => update(person.guestId, { phone: value })}
                                  inputMode="tel"
                                  placeholder="Including the country code"
                                />
                                <Field
                                  label="Email — optional"
                                  value={person.email}
                                  onChange={(value) => update(person.guestId, { email: value })}
                                  inputMode="email"
                                  placeholder="Optional"
                                />
                              </div>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>

                <div className="mt-6 rounded-[26px] border border-[#ddd8cf] bg-white/72 p-5 shadow-[0_24px_70px_-54px_rgba(43,45,39,0.55)] sm:p-7">
                  <Field
                    label={`A note for ${partnerA} & ${partnerB}`}
                    value={message}
                    onChange={setMessage}
                    multiline
                  />
                </div>

                {error ? (
                  <motion.p
                    role="alert"
                    initial={reduce ? false : { opacity: 0, x: -5 }}
                    animate={reduce ? { opacity: 1 } : { opacity: 1, x: [-5, 4, -2, 0] }}
                    transition={{ duration: 0.4 }}
                    className="mt-5 rounded-2xl bg-[#f3dfdc] px-5 py-3 text-center text-[15px] text-[#914b40]"
                  >
                    {error}
                  </motion.p>
                ) : null}

                <motion.button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  whileTap={reduce ? undefined : { scale: 0.99 }}
                  transition={{ type: "spring", stiffness: 460, damping: 30 }}
                  className="mt-6 min-h-14 w-full rounded-2xl bg-[#24372d] px-7 text-[16px] font-medium tracking-[0.02em] text-white shadow-[0_18px_38px_-20px_rgba(36,55,45,0.8)] transition-colors hover:bg-[#18271f] disabled:opacity-60"
                >
                  {submitLabel}
                </motion.button>
                <p className="mt-4 text-center text-[15px] text-[#8b877f]">
                  Replies close on {rsvpBy}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <footer className="border-t border-[#ded8cf] px-5 py-8 text-center">
        <p className="font-script text-[31px] text-[#455e4c]">
          {partnerA} <span className="text-[#cf8f73]">&</span> {partnerB}
        </p>
      </footer>
    </main>
  );
}

/**
 * The date the couple need an answer by.
 *
 * It used to sit in small grey type under the button, where it was read after
 * the decision it was meant to inform — if at all. It belongs at the head of
 * the reply, set like the date on a piece of stationery: ruled either side,
 * the day itself large enough to be the thing you remember.
 */
function ReplyBy({ date, days }: { date: string; days: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto mb-8 max-w-[620px] rounded-[24px] border border-[#e2cbb5] bg-[#fbefe3] px-6 py-6 text-center shadow-[0_24px_60px_-46px_rgba(122,82,56,0.75)] sm:mb-11 sm:px-10 sm:py-7"
    >
      <div className="flex items-center justify-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[#d9b89c]" />
        <p className="text-[13.5px] font-semibold uppercase tracking-[0.26em] text-[#a06c4a]">
          Please reply by
        </p>
        <span aria-hidden className="h-px w-8 bg-[#d9b89c]" />
      </div>

      <p className="mt-3 font-display text-[34px] leading-[1.05] text-[#24372d] sm:text-[44px]">
        {date}
      </p>

      {days > 0 ? (
        <p className="mt-2.5 text-[15px] text-[#8d6a52]">
          {days === 1 ? "One day left to let us know" : `${days} days left to let us know`}
        </p>
      ) : days === 0 ? (
        <p className="mt-2.5 text-[15px] font-medium text-[#a4503f]">Today is the last day</p>
      ) : (
        <p className="mt-2.5 text-[15px] text-[#8d6a52]">
          We’re past the date — do still tell us, as soon as you can.
        </p>
      )}
    </motion.div>
  );
}

/** A small piece of stationery furniture — a rule with a diamond in it. */
function Ornament() {
  return (
    <div aria-hidden className="mx-auto mb-6 flex w-24 items-center gap-2">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#b9cdbe]" />
      <span className="h-1.5 w-1.5 rotate-45 bg-[#b9cdbe]" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#b9cdbe]" />
    </div>
  );
}

function Answer({
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
      aria-pressed={selected}
      whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 480, damping: 26 }}
      className={cn(
        "flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4",
        "text-[15px] font-medium leading-tight transition-all duration-300",
        selected && tone === "yes" &&
          "border-[#294436] bg-[#294436] text-white shadow-[0_10px_24px_-14px_rgba(41,68,54,0.9)]",
        selected && tone === "no" &&
          "border-[#735748] bg-[#735748] text-white shadow-[0_10px_24px_-14px_rgba(115,87,72,0.75)]",
        !selected &&
          "border-[#d9d4cc] bg-[#fbfaf7] text-[#69675f] hover:border-[#a9a49a] hover:bg-white",
      )}
    >
      <ChoiceIcon tone={tone} />
      {children}
    </motion.button>
  );
}

function ChoiceIcon({ tone }: { tone: "yes" | "no" }) {
  return (
    <svg
      aria-hidden
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 opacity-75"
    >
      {tone === "yes" ? (
        <path d="m3.2 8.2 3 3.1 6.7-7" />
      ) : (
        <path d="m4.2 4.2 7.6 7.6m0-7.6-7.6 7.6" />
      )}
    </svg>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  inputMode?: "tel" | "email";
  multiline?: boolean;
  placeholder?: string;
}) {
  const shared =
    "min-h-[52px] w-full rounded-2xl border border-[#d9d4cb] bg-[#fbfaf7] px-4 py-3 text-[15px] text-[#2d332d] " +
    "placeholder:text-[#aaa59b] outline-none transition-all duration-300 " +
    "focus:border-[#6d8373] focus:bg-white focus:shadow-[0_0_0_3px_rgba(109,131,115,0.13)]";

  return (
    <label className="block">
      <span className="mb-2 block text-[15px] font-medium text-[#66645d]">{label}</span>
      {multiline ? (
        <textarea
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} resize-none`}
          placeholder={placeholder ?? "Optional"}
        />
      ) : (
        <input
          value={value}
          inputMode={inputMode}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={shared}
        />
      )}
    </label>
  );
}

function Thanks({
  coming,
  total,
  partnerA,
  partnerB,
  onChange,
}: {
  coming: number;
  total: number;
  partnerA: string;
  partnerB: string;
  onChange(): void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border border-[#d8d4cb] bg-white/78 px-6 py-12 text-center shadow-[0_30px_80px_-48px_rgba(43,45,39,0.5)] sm:px-10 sm:py-16"
    >
      <motion.span
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
        className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#294436] text-white"
      >
        <CheckIcon size={24} />
      </motion.span>

      <Ornament />

      <h2 className="font-script text-[50px] leading-[1.05] text-[#2d332d] sm:text-[64px]">
        {coming > 0 ? "We can't wait" : "Thank you for telling us"}
      </h2>

      <p className="mx-auto mt-4 max-w-[25rem] text-[16px] leading-relaxed text-[#716f68]">
        {coming > 0
          ? total === 1
            ? "We’re so happy you’ll be there. We’ll be in touch with everything you need for Bali."
            : coming === total
              ? "We’re so happy you can all be there. We’ll be in touch with everything you need for Bali."
              : `${coming} of you are joining us. We’ll be in touch with everything you need for Bali.`
          : "We're so sorry you can't be with us — you'll be missed more than you know."}
      </p>

      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.6 }}
        className="mt-8 font-script text-[32px] text-[#455e4c]"
      >
        {partnerA} <span className="text-[#c98d72]">&</span> {partnerB}
      </motion.p>

      <button
        type="button"
        onClick={onChange}
        className="mt-8 text-[15px] text-[#817d75] underline-offset-4 transition-colors hover:text-[#2d332d] hover:underline"
      >
        Change something
      </button>
    </motion.div>
  );
}

/**
 * Music, off by default and obvious to turn on.
 *
 * Every browser blocks audio that begins by itself, so autoplay would fail even
 * if starting unasked in somebody's office were a kind thing to do. It fades
 * rather than cutting, at either end.
 */
function Music({ src }: { src: string }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);

  async function toggle() {
    const audio = ref.current;
    if (!audio) return;

    if (playing) {
      const fade = setInterval(() => {
        if (audio.volume > 0.06) audio.volume -= 0.06;
        else {
          audio.volume = 0;
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
      return;
    }
    setPlaying(true);
    const fade = setInterval(() => {
      if (audio.volume < 0.32) audio.volume = Math.min(0.32, audio.volume + 0.035);
      else clearInterval(fade);
    }, 90);
  }

  return (
    <>
      <audio ref={ref} src={src} preload="none" />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        aria-label={playing ? "Turn the music off" : "Play music"}
        className="fixed right-4 top-4 z-40 flex min-h-12 items-center gap-2.5 rounded-full border border-white/25 bg-[#191b18]/68 px-4 text-[15px] font-medium text-white shadow-[0_12px_35px_-18px_rgba(0,0,0,0.8)] backdrop-blur-xl transition-colors hover:bg-[#191b18]/82 sm:right-6 sm:top-6"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/25 bg-white/10">
          {playing ? (
            <span className="flex items-end gap-[2px]" aria-hidden>
              {[0, 1, 2].map((bar) => (
                <motion.span
                  key={bar}
                  animate={{ height: [5, 12, 7, 10, 5] }}
                  transition={{
                    duration: 1.4,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: bar * 0.18,
                  }}
                  className="w-[2px] rounded-full bg-current"
                />
              ))}
            </span>
          ) : (
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M6.2 11.6V4.8l6-1.4v6.4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="4.4" cy="11.8" r="1.8" fill="currentColor" />
              <circle cx="10.4" cy="10" r="1.8" fill="currentColor" />
            </svg>
          )}
        </span>
        <span>{playing ? "Music on" : "Play music"}</span>
      </button>
    </>
  );
}
