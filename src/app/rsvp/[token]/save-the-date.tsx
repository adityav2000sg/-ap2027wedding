"use client";

/**
 * The save-the-date.
 *
 * The card is the page. It holds the whole first screen, unhurried and
 * uninterrupted, and stays behind everything afterwards — as you scroll it
 * settles back out of focus and the reply rises over it, so the artwork never
 * leaves and the form never competes with it.
 *
 * One question, two answers. A year out, "roughly, can you come" is the only
 * thing worth asking; dietary requirements and room preferences belong on the
 * invitation proper at the end of the year.
 *
 * Everything here is switched off for anyone whose system asks for less motion
 * — the page reads perfectly well entirely still.
 */

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "motion/react";

import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";
import { submitRsvp } from "@/server/actions/rsvp";

export interface StdPerson {
  guestId: string;
  name: string;
  response: "YES" | "NO" | null;
}

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
  partnerA,
  partnerB,
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
  partnerA: string;
  partnerB: string;
}) {
  const reduce = useReducedMotion();
  const [people, setPeople] = React.useState(initialPeople);
  const [contact, setContact] = React.useState({ phone, email });
  const [message, setMessage] = React.useState(initialMessage);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ coming: number; total: number } | null>(null);

  // The card recedes as the reply comes forward: it blurs, dims and drifts up a
  // little, so scrolling feels like stepping through the gate rather than past
  // a picture of one.
  const { scrollYProgress } = useScroll();
  const blur = useTransform(scrollYProgress, [0, 0.28], [0, 16]);
  const artOpacity = useTransform(scrollYProgress, [0, 0.32], [1, 0.42]);
  const artScale = useTransform(scrollYProgress, [0, 0.5], [1, 1.1]);
  const artY = useTransform(scrollYProgress, [0, 0.5], [0, -40]);
  const filter = useTransform(blur, (value) => `blur(${value}px)`);

  const unanswered = people.filter((person) => person.response === null).length;
  const yesCount = people.filter((person) => person.response === "YES").length;

  function answer(guestId: string, response: "YES" | "NO") {
    setPeople((current) =>
      current.map((person) =>
        person.guestId === guestId ? { ...person, response } : person,
      ),
    );
    setError(null);
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
    <main className="relative min-h-dvh bg-[#dfeae6] bg-gradient-to-b from-[#dfeae6] via-[#eaf1ec] to-[#f3f7f3]">
      {music ? <Music src={music} /> : null}

      {/* The card, fixed behind everything. */}
      <motion.div
        aria-hidden={false}
        style={
          reduce
            ? undefined
            : { filter, opacity: artOpacity, scale: artScale, y: artY }
        }
        className="pointer-events-none fixed inset-0 flex items-start justify-center overflow-hidden"
      >
        {artwork ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 1.08 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative h-full w-full"
          >
            {/* The card is a portrait; a screen rarely is. Rather than crop it
                or letterbox it against a flat colour, a heavily blurred copy
                fills whatever is left over, so the edges dissolve into the
                card's own washes instead of meeting a seam. */}
            <Image
              src={artwork}
              alt=""
              aria-hidden
              fill
              priority
              sizes="100vw"
              className="scale-125 object-cover blur-3xl saturate-[0.85]"
            />
            <div className="absolute inset-0 mx-auto w-full max-w-[560px]">
              <Image
                src={artwork}
                alt={`Save the date for the wedding of ${partnerA} and ${partnerB}`}
                fill
                priority
                sizes="(min-width: 640px) 560px, 100vw"
                className="object-contain object-top drop-shadow-[0_18px_50px_rgba(31,58,45,0.18)]"
              />
            </div>
          </motion.div>
        ) : (
          <Placeholder partnerA={partnerA} partnerB={partnerB} />
        )}
      </motion.div>

      {/* One full screen of nothing but the card. */}
      <section className="relative h-dvh">
        {!done ? (
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: reduce ? 0 : 2 }}
            className="pointer-events-none absolute inset-x-0 bottom-8 flex flex-col items-center gap-2"
          >
            <span className="text-[15px] uppercase tracking-[0.18em] text-[#4a6553]">
              Scroll to reply
            </span>
            <motion.span
              animate={reduce ? undefined : { y: [0, 7, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              className="text-[#4a6553]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v10M4 9.5l4 4 4-4" />
              </svg>
            </motion.span>
          </motion.div>
        ) : null}
      </section>

      {/* The reply, over the top. */}
      <section className="relative px-4 pb-20">
        <div className="mx-auto max-w-[560px]">
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
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                exit={reduce ? undefined : { opacity: 0, y: -16 }}
                className="rounded-[28px] border border-[#c5d7c9] bg-[#fbfcfa]/92 p-6 shadow-[0_30px_80px_-40px_rgba(31,58,45,0.55)] backdrop-blur-xl sm:p-9"
              >
                <Ornament />

                <div className="text-center">
                  <p className="text-[15px] uppercase tracking-[0.18em] text-[#7d9585]">
                    {householdName}
                  </p>
                  <h2 className="mt-3 font-script text-[42px] leading-[1.05] text-[#243a2d] sm:text-[52px]">
                    Will you join us?
                  </h2>
                  <p className="mx-auto mt-3 max-w-[21rem] text-[15px] leading-relaxed text-[#5d7d68]">
                    Nothing binding — we're only getting a sense of numbers. The
                    invitation follows later this year.
                  </p>
                </div>

                {alreadyReplied ? (
                  <p className="mt-6 rounded-2xl bg-[#e4ede6] px-4 py-2.5 text-center text-[15px] text-[#4a6553]">
                    You've answered already. Change anything and send it again.
                  </p>
                ) : null}

                <div className="mt-7 space-y-2.5">
                  {people.map((person, index) => (
                    <motion.div
                      key={person.guestId}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.7,
                        ease: [0.22, 1, 0.36, 1],
                        delay: reduce ? 0 : 0.12 + index * 0.06,
                      }}
                      className={cn(
                        "rounded-2xl border px-4 py-4 transition-colors duration-500",
                        person.response === "YES"
                          ? "border-[#bcd2c1] bg-[#f2f7f2]"
                          : person.response === "NO"
                            ? "border-[#e2dbd4] bg-[#faf7f4]"
                            : "border-[#dce7de] bg-white/70",
                      )}
                    >
                      {/* Their name set like a place card — centred, with a
                          hairline under it — so answering feels like being
                          seated rather than filling in a row of a table. */}
                      <p className="text-center font-display text-[17px] tracking-[0.01em] text-[#243a2d]">
                        {person.name}
                      </p>
                      <span
                        aria-hidden
                        className="mx-auto mt-2 mb-3 block h-px w-10 bg-[#cfdfd3]"
                      />
                      <div className="grid grid-cols-2 gap-2.5">
                        <Answer
                          selected={person.response === "YES"}
                          tone="yes"
                          onClick={() => answer(person.guestId, "YES")}
                        >
                          Yes, with joy
                        </Answer>
                        <Answer
                          selected={person.response === "NO"}
                          tone="no"
                          onClick={() => answer(person.guestId, "NO")}
                        >
                          No, with regret
                        </Answer>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 space-y-3 border-t border-[#dce7de] pt-5">
                  <p className="text-center text-[15px] text-[#7d9585]">
                    So the invitation reaches the right place
                  </p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <Field
                      label="Phone"
                      value={contact.phone}
                      onChange={(v) => setContact((c) => ({ ...c, phone: v }))}
                      inputMode="tel"
                    />
                    <Field
                      label="Email"
                      value={contact.email}
                      onChange={(v) => setContact((c) => ({ ...c, email: v }))}
                      inputMode="email"
                    />
                  </div>
                  <Field
                    label="A note for the couple"
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
                    className="mt-4 rounded-xl bg-[#f6e5e2] px-4 py-2.5 text-center text-[15px] text-[#9b4a3a]"
                  >
                    {error}
                  </motion.p>
                ) : null}

                <motion.button
                  type="button"
                  onClick={submit}
                  disabled={pending}
                  whileTap={reduce ? undefined : { scale: 0.985 }}
                  transition={{ type: "spring", stiffness: 460, damping: 30 }}
                  className={cn(
                    "mt-6 w-full rounded-2xl bg-[#2f5340] py-4 text-[15px] tracking-[0.02em] text-[#f4f8f4]",
                    "transition-colors duration-300 hover:bg-[#24402f] disabled:opacity-60",
                  )}
                >
                  {pending
                    ? "Sending…"
                    : yesCount > 0
                      ? "Save our places"
                      : alreadyReplied
                        ? "Send the changes"
                        : "Send our reply"}
                </motion.button>

                <p className="mt-5 text-center text-[15px] leading-relaxed text-[#8fa697]">
                  Kindly reply by {rsvpBy}
                  <br />
                  This link is just for {householdName}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </main>
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
        "relative flex min-h-[46px] items-center justify-center gap-1.5 overflow-hidden rounded-xl border px-3",
        "text-[15px] leading-tight transition-colors duration-500",
        selected && tone === "yes" &&
          "border-[#2f5340] bg-[#2f5340] text-[#f4f8f4] shadow-[0_6px_18px_-8px_rgba(47,83,64,0.8)]",
        selected && tone === "no" &&
          "border-[#cbb6a6] bg-[#efe4da] text-[#7a5b48]",
        !selected &&
          "border-[#dbe6dd] bg-white/85 text-[#5d7d68] hover:border-[#b3c9b8] hover:bg-white",
      )}
    >
      {/* A soft bloom of colour on the chosen one, so the tap lands with a
          little warmth rather than a hard state flip. */}
      {selected ? (
        <motion.span
          aria-hidden
          initial={reduce ? false : { scale: 0, opacity: 0.55 }}
          animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            "absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full",
            tone === "yes" ? "bg-[#7fa189]" : "bg-[#cbb6a6]",
          )}
        />
      ) : null}

      <span className="relative flex items-center gap-1.5">
        <Sprig lit={selected} tone={tone} />
        {children}
      </span>
    </motion.button>
  );
}

/**
 * The little mark beside each answer: a sprig for yes, and for no the same
 * sprig with its leaves fallen off. Drawn rather than an emoji so it takes the
 * button's own colour and matches the card's line weight.
 */
function Sprig({ lit, tone }: { lit: boolean; tone: "yes" | "no" }) {
  const reduce = useReducedMotion();
  return (
    <motion.svg
      aria-hidden
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      className="shrink-0 opacity-80"
      initial={false}
      animate={reduce || !lit ? { rotate: 0 } : { rotate: [0, -12, 6, 0] }}
      transition={{ duration: 0.7, ease: "easeOut" }}
    >
      <path d="M6 11V2" />
      {tone === "yes" ? (
        <>
          <path d="M6 5.4C6 3.9 7.2 2.7 8.9 2.5 8.9 4.2 7.7 5.4 6 5.4Z" />
          <path d="M6 8.1C6 6.7 4.8 5.6 3.1 5.4 3.1 7 4.3 8.1 6 8.1Z" />
        </>
      ) : (
        <path d="M3.4 3.6 8.6 3.6" />
      )}
    </motion.svg>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  multiline,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  inputMode?: "tel" | "email";
  multiline?: boolean;
}) {
  const shared =
    "w-full rounded-xl border border-[#dce7de] bg-white/70 px-3.5 py-2.5 text-[15px] text-[#243a2d] " +
    "placeholder:text-[#a9bdae] outline-none transition-all duration-300 " +
    "focus:border-[#7fa189] focus:bg-white focus:shadow-[0_0_0_3px_rgba(127,161,137,0.16)]";

  return (
    <label className="block">
      <span className="mb-1.5 block text-[15px] text-[#7d9585]">{label}</span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} resize-none`}
          placeholder="Optional, and very much read"
        />
      ) : (
        <input
          value={value}
          inputMode={inputMode}
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
      className="rounded-[28px] border border-[#c5d7c9] bg-[#fbfcfa]/92 px-6 py-12 text-center shadow-[0_30px_80px_-40px_rgba(31,58,45,0.55)] backdrop-blur-xl sm:px-10"
    >
      <motion.span
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
        className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#2f5340] text-[#f4f8f4]"
      >
        <CheckIcon size={24} />
      </motion.span>

      <Ornament />

      <h2 className="font-script text-[46px] leading-[1.05] text-[#243a2d] sm:text-[58px]">
        {coming > 0 ? "We can't wait" : "Thank you for telling us"}
      </h2>

      <p className="mx-auto mt-4 max-w-[21rem] text-[15px] leading-relaxed text-[#5d7d68]">
        {coming > 0
          ? coming === total
            ? "You're all pencilled in. The invitation, with everything about the week, follows later this year."
            : `${coming} of you are pencilled in. The invitation follows later this year.`
          : "We're so sorry you can't be with us — you'll be missed more than you know."}
      </p>

      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.6 }}
        className="mt-8 font-script text-[30px] text-[#3f6b4f]"
      >
        {partnerA} <span className="text-[#c98d72]">&</span> {partnerB}
      </motion.p>

      <button
        type="button"
        onClick={onChange}
        className="mt-8 text-[15px] text-[#8fa697] underline-offset-4 transition-colors hover:text-[#243a2d] hover:underline"
      >
        Change something
      </button>
    </motion.div>
  );
}

/** Shown when the artwork file hasn't been added, so the page still stands up. */
function Placeholder({ partnerA, partnerB }: { partnerA: string; partnerB: string }) {
  return (
    <div className="flex h-full w-full max-w-[560px] flex-col items-center justify-center px-8 text-center">
      <p className="text-[15px] uppercase tracking-[0.18em] text-[#7d9585]">
        Save the date for the wedding of
      </p>
      <p className="mt-4 font-script text-[52px] leading-tight text-[#3f6b4f]">
        {partnerA} <span className="text-[#c98d72]">&</span> {partnerB}
      </p>
      <p className="mt-4 text-[15px] uppercase tracking-[0.14em] text-[#5d7d68]">
        Bali, Indonesia · 16–19 June 2027
      </p>
    </div>
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
      if (audio.volume < 0.32) audio.volume += 0.035;
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
        className="fixed right-4 top-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-[#c5d7c9] bg-white/85 text-[#3f6b4f] shadow-sm backdrop-blur-md transition-colors hover:bg-white"
      >
        {playing ? (
          <span className="flex items-end gap-[2px]" aria-hidden>
            {[0, 1, 2].map((bar) => (
              <motion.span
                key={bar}
                animate={{ height: [5, 13, 7, 11, 5] }}
                transition={{
                  duration: 1.4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: bar * 0.18,
                }}
                className="w-[2.5px] rounded-full bg-current"
              />
            ))}
          </span>
        ) : (
          <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden>
            <path d="M6 3.4v9.2l6-4.6z" fill="currentColor" />
          </svg>
        )}
      </button>
    </>
  );
}
