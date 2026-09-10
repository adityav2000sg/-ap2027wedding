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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/cn";
import { CheckIcon } from "@/components/ui/icons";
import { submitRsvp } from "@/server/actions/rsvp";

/**
 * Never leave somebody looking at "Sending…" forever.
 *
 * A reply that hangs is worse than one that fails: the guest has no idea
 * whether they have answered, and the button that would tell them is disabled.
 * If nothing comes back in twenty-five seconds we treat it as failed and hand
 * the form back. The request may still land — a reply overwrites, so a
 * duplicate costs nothing.
 */
const SEND_TIMEOUT_MS = 25_000;

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timed out")), SEND_TIMEOUT_MS),
    ),
  ]);
}

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
  const router = useRouter();
  const reduce = useReducedMotion();
  const [people, setPeople] = React.useState(initialPeople);
  const [message, setMessage] = React.useState(initialMessage);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ coming: number; total: number } | null>(null);
  const [leaving, setLeaving] = React.useState(false);

  // A yes opens the wedding website from the beginning. The acknowledgement
  // and confetti get a moment to land, then a cream veil bridges the two pages
  // while Next swaps them in-place. This keeps the invitation feeling like one
  // continuous piece rather than flashing into an anchor halfway down a page.
  React.useEffect(() => {
    if (!done || done.coming === 0) return;

    const veilTimer = window.setTimeout(() => setLeaving(true), 1_550);
    const navigationTimer = window.setTimeout(() => {
      router.push("/home?reply=received", { scroll: true });
    }, 2_050);

    return () => {
      window.clearTimeout(veilTimer);
      window.clearTimeout(navigationTimer);
    };
  }, [done, router]);

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

    try {
      const result = await withTimeout(
        submitRsvp({
          token,
          message: message || undefined,
          people: people.map((person) => ({
            guestId: person.guestId,
            coming: person.response,
            phone: person.phone.trim() || undefined,
            email: person.email.trim() || undefined,
          })),
        }),
      );

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone({ coming: result.coming, total: result.total });
    } catch {
      // A dropped connection, a phone that slept mid-send, a server that never
      // answered. Whatever it was, the guest gets told and gets the button
      // back — sending twice is harmless, because a reply overwrites.
      setError("That didn't send. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f6f1e9] text-[#282a25]">
      {music ? <Music src={music} /> : null}

      {/* Petals fall over the whole page, so they are mounted here rather than
          inside the thank-you card: a transformed ancestor turns `fixed` into
          `absolute`, and the celebration would be trapped in a box. */}
      {done && done.coming > 0 ? <Celebration /> : null}

      <AnimatePresence>
        {leaving ? (
          <motion.div
            key="page-transition"
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 0.55, ease: [0.4, 0, 0.2, 1] }}
            className="pointer-events-none fixed inset-0 z-[70] bg-[#f4f0e9]"
          />
        ) : null}
      </AnimatePresence>

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

        <nav className="absolute left-1/2 top-4 z-20 flex w-[calc(100%-32px)] max-w-[620px] -translate-x-1/2 items-center justify-between rounded-[20px] border border-white/40 bg-[#fffdf8]/92 p-1.5 pl-4 shadow-[0_16px_46px_-30px_rgba(0,0,0,0.75)] backdrop-blur-md sm:top-6 sm:rounded-[24px] sm:pl-5">
          <Link href="/home" className="font-display text-[19px] leading-none text-[#23362b]">
            A<span className="px-0.5 text-[#c87958]">&</span>P
          </Link>
          <div className="flex items-center gap-1 text-[15px] font-medium">
            <Link href="/home" className="hidden rounded-full px-3 py-2 text-[#596158] hover:bg-[#ede9e1] sm:block">
              Wedding
            </Link>
            <a href="#reply" className="rounded-[16px] bg-[#2b4637] px-4 py-2.5 text-white hover:bg-[#1f3428]">
              Your reply
            </a>
          </div>
        </nav>

        <div className="relative mx-auto w-full max-w-[1120px] px-5 py-20 text-center text-white">
          <div className="mb-5 flex items-center justify-center gap-3">
            <span aria-hidden className="h-px w-8 bg-[#d99778]" />
            <p className="text-[15px] font-medium uppercase tracking-[0.18em] text-white/78">
              You are invited to the wedding of
            </p>
            <span aria-hidden className="h-px w-8 bg-[#d99778]" />
          </div>
          {/* One fluid size, capped where the line still fits its column, and
              one deliberate break on a phone so Prateek can never run off the
              edge. */}
          <h1 className="font-script text-[clamp(38px,7.4vw,86px)] leading-[1.12] text-white drop-shadow-[0_3px_22px_rgba(0,0,0,0.38)] sm:whitespace-nowrap">
            {partnerA}
            <br className="sm:hidden" />
            <span className="mx-1.5 inline-block text-[#e0a084] sm:mx-3 lg:mx-5">&</span>
            <span className="inline-block">{partnerB}</span>
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

      {/* Everything below is sized for the phone most guests will open this
          on, and steps DOWN on a larger screen rather than up. It used to do
          the opposite — 16px body and a 66px hand on a laptop — which read
          like a page left at 130% zoom. */}
      <section id="reply" className="scroll-mt-4 px-4 py-12 sm:px-6 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-[760px]">
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
                  <p className="text-[13.5px] font-medium uppercase tracking-[0.18em] text-[#8b7465]">
                    Your reply
                  </p>
                  <h2 className="mt-2.5 font-display text-[30px] leading-[1.12] text-[#2d332d] sm:text-[44px]">
                    Will you join us in Bali?
                  </h2>
                  <p className="mt-3.5 text-[15px] leading-relaxed text-[#716f68] sm:text-[14.5px]">
                    {onePerson
                      ? "We would love to celebrate with you. Please let us know if you can join us."
                      : "We would love to celebrate with you. Please reply for each person listed below."}
                  </p>
                </header>

                <ReplyBy date={rsvpBy} days={rsvpByDays} />

                {alreadyReplied ? (
                  <p className="mb-5 rounded-2xl border border-[#ccd8ce] bg-[#edf3ed] px-5 py-3 text-center text-[14px] text-[#4d6654]">
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
                      <p className="font-display text-[18.5px] leading-tight text-[#2d332d]">
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
                              <p className="mb-3 text-[14px] text-[#5c7666]">
                                {onePerson
                                  ? "Wonderful. Where can we reach you?"
                                  : `Wonderful. Where can we reach ${person.name.split(" ")[0]}?`}
                              </p>
                              <div className="grid gap-4 sm:grid-cols-2">
                                <PhoneField
                                  value={person.phone}
                                  onChange={(value) => update(person.guestId, { phone: value })}
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
                    className="mt-5 rounded-2xl bg-[#f3dfdc] px-5 py-3 text-center text-[14px] text-[#914b40]"
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
                  className="mt-6 min-h-[52px] w-full rounded-2xl bg-[#24372d] px-7 text-[15px] font-medium tracking-[0.02em] text-white shadow-[0_18px_38px_-20px_rgba(36,55,45,0.8)] transition-colors hover:bg-[#18271f] disabled:opacity-60"
                >
                  {submitLabel}
                </motion.button>
                <p className="mt-4 text-center text-[13.5px] text-[#8b877f]">
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
      className="mx-auto mb-8 max-w-[560px] rounded-[24px] border border-[#e2cbb5] bg-[#fbefe3] px-6 py-5 text-center shadow-[0_24px_60px_-46px_rgba(122,82,56,0.75)] sm:mb-10 sm:px-9 sm:py-6"
    >
      <div className="flex items-center justify-center gap-3">
        <span aria-hidden className="h-px w-8 bg-[#d9b89c]" />
        <p className="text-[12.5px] font-semibold uppercase tracking-[0.26em] text-[#a06c4a]">
          Please reply by
        </p>
        <span aria-hidden className="h-px w-8 bg-[#d9b89c]" />
      </div>

      <p className="mt-2.5 font-display text-[30px] leading-[1.05] text-[#24372d] sm:text-[36px]">
        {date}
      </p>

      {days > 0 ? (
        <p className="mt-2 text-[13.5px] text-[#8d6a52]">
          {days === 1 ? "One day left to let us know" : `${days} days left to let us know`}
        </p>
      ) : days === 0 ? (
        <p className="mt-2 text-[13.5px] font-medium text-[#a4503f]">Today is the last day</p>
      ) : (
        <p className="mt-2 text-[13.5px] text-[#8d6a52]">
          We’re past the date — do still tell us, as soon as you can.
        </p>
      )}
    </motion.div>
  );
}

/**
 * Petals, for a yes.
 *
 * Somebody has just said they will fly to Bali for you. The screen should do
 * something about that — but a wedding is not a video game, so this is petals
 * on a breeze rather than confetti cannons: the palette of the invitation
 * itself, drifting past once and clearing off after seven seconds.
 *
 * Nothing at all for a no, and nothing for anybody whose system asks for less
 * motion. A celebration you can't turn off is just noise.
 */
/**
 * The celebration.
 *
 * Somebody has just said they will fly to Bali for you, and a tick in a circle
 * is not an adequate response to that. Two cannons fire from the bottom corners
 * the moment the card lands, a second volley goes up through the middle, and
 * marigold and gold keep drifting down over the whole page for a few seconds
 * afterwards.
 *
 * Drawn on one canvas rather than as a few hundred animated elements: a DOM
 * node per petal is what turns a celebration into a stutter on the phone most
 * guests will open this on. Nothing at all for a no, and nothing for anybody
 * whose system asks for less motion.
 */
const CONFETTI_COLOURS = [
  "#f0a830", // marigold
  "#e8892b", // saffron
  "#cf8a68", // terracotta
  "#d8b45a", // gold
  "#e0a084", // blush
  "#294436", // the deep green of the invitation
  "#7f9b86", // sage
  "#f6f1e9", // cream
];

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  size: number;
  ratio: number;
  spin: number;
  angle: number;
  wobble: number;
  wobbleSpeed: number;
  colour: string;
  shape: 0 | 1 | 2;
  life: number;
}

function Celebration() {
  const reduce = useReducedMotion();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [spent, setSpent] = React.useState(false);

  React.useEffect(() => {
    if (reduce) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    // A full-screen 3x canvas on a phone is millions of pixels per frame. Cap
    // mobile density a little lower: the pieces stay crisp, but the animation
    // keeps enough headroom for the page transition beside it.
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 640 ? 1.35 : 2);
    let width = window.innerWidth;
    let height = window.innerHeight;
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const random = (min: number, max: number) => min + Math.random() * (max - min);
    const pieces: Piece[] = [];

    const make = (x: number, y: number, vx: number, vy: number, size: number): Piece => ({
      x,
      y,
      vx,
      vy,
      gravity: random(0.14, 0.24),
      drag: random(0.986, 0.995),
      size,
      ratio: random(0.42, 1),
      spin: random(-0.28, 0.28),
      angle: random(0, Math.PI * 2),
      wobble: random(0, Math.PI * 2),
      wobbleSpeed: random(0.04, 0.11),
      colour: CONFETTI_COLOURS[Math.floor(Math.random() * CONFETTI_COLOURS.length)],
      shape: Math.floor(random(0, 3)) as 0 | 1 | 2,
      life: 1,
    });

    /** A cannon: a tight spray of pieces along one heading. */
    const fire = (x: number, y: number, heading: number, spread: number, count: number, power: number) => {
      for (let i = 0; i < count; i += 1) {
        const angle = heading + random(-spread, spread);
        const speed = random(power * 0.55, power);
        pieces.push(
          make(x, y, Math.cos(angle) * speed, Math.sin(angle) * speed, random(6, 13)),
        );
      }
    };

    // Both corners, at once, as the card lands.
    fire(0, height, -Math.PI / 3.1, 0.42, 46, 26);
    fire(width, height, -Math.PI + Math.PI / 3.1, 0.42, 46, 26);
    const volley = window.setTimeout(() => {
      fire(width / 2, height * 0.92, -Math.PI / 2, 0.7, 34, 22);
    }, 260);

    // And a slow fall over everything, for as long as it runs.
    let shower: number | undefined = window.setInterval(() => {
      for (let i = 0; i < 2; i += 1) {
        const piece = make(random(0, width), -20, random(-0.6, 0.6), random(1.4, 3), random(6, 12));
        piece.gravity = random(0.02, 0.05);
        pieces.push(piece);
      }
    }, 110);

    const started = performance.now();
    const RUN = 6200;
    const FADE = 1400;
    let frame = 0;
    let lastFrame = started;

    const draw = (now: number) => {
      const elapsed = now - started;
      // Physics are measured against a 60fps frame. If the browser misses a
      // frame, advance by the elapsed time instead of advancing by one frame;
      // that is what prevents the confetti visibly dropping into slow motion.
      const frameScale = Math.min(Math.max((now - lastFrame) / (1000 / 60), 0.25), 3);
      lastFrame = now;
      context.clearRect(0, 0, width, height);
      const fading = Math.max(0, Math.min(1, (elapsed - (RUN - FADE)) / FADE));

      for (const piece of pieces) {
        piece.vy += piece.gravity * frameScale;
        piece.vx *= Math.pow(piece.drag, frameScale);
        piece.vy *= Math.pow(piece.drag, frameScale);
        piece.wobble += piece.wobbleSpeed * frameScale;
        piece.x += (piece.vx + Math.cos(piece.wobble) * 0.9) * frameScale;
        piece.y += piece.vy * frameScale;
        piece.angle += piece.spin * frameScale;

        if (piece.y > height + 40) piece.life = 0;
        if (piece.life === 0) continue;

        context.save();
        context.translate(piece.x, piece.y);
        context.rotate(piece.angle);
        // Foil catches the light as it turns: squashing the width on the wobble
        // is what makes a flat rectangle read as a tumbling piece of paper.
        context.scale(Math.cos(piece.wobble) * 0.6 + 0.4, 1);
        context.globalAlpha = 1 - fading;
        context.fillStyle = piece.colour;

        if (piece.shape === 0) {
          context.fillRect(-piece.size / 2, -(piece.size * piece.ratio) / 2, piece.size, piece.size * piece.ratio);
        } else if (piece.shape === 1) {
          context.beginPath();
          context.arc(0, 0, piece.size / 2.4, 0, Math.PI * 2);
          context.fill();
        } else {
          context.beginPath();
          context.ellipse(0, 0, piece.size / 2, (piece.size * piece.ratio) / 1.6, 0, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
      }

      if (elapsed > RUN * 0.72 && shower !== undefined) {
        window.clearInterval(shower);
        shower = undefined;
      }

      if (elapsed < RUN) {
        frame = requestAnimationFrame(draw);
      } else {
        context.clearRect(0, 0, width, height);
        setSpent(true);
      }
    };

    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(volley);
      if (shower !== undefined) window.clearInterval(shower);
      window.removeEventListener("resize", resize);
    };
  }, [reduce]);

  if (reduce || spent) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50"
    />
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
        "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4",
        "whitespace-nowrap text-[14px] font-medium leading-tight transition-all duration-300",
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

/**
 * Dialling codes, most likely first.
 *
 * The list is the wedding's own geography — London, Delhi, Singapore, the Gulf
 * — and then the rest of the places guests are flying from. Held by ISO code
 * rather than by dialling code because the United States and Canada share +1
 * and a dropdown cannot have two options with the same value.
 */
const DIAL_CODES: { iso: string; flag: string; dial: string; name: string }[] = [
  { iso: "GB", flag: "🇬🇧", dial: "+44", name: "United Kingdom" },
  { iso: "IN", flag: "🇮🇳", dial: "+91", name: "India" },
  { iso: "SG", flag: "🇸🇬", dial: "+65", name: "Singapore" },
  { iso: "AE", flag: "🇦🇪", dial: "+971", name: "United Arab Emirates" },
  { iso: "US", flag: "🇺🇸", dial: "+1", name: "United States" },
  { iso: "CA", flag: "🇨🇦", dial: "+1", name: "Canada" },
  { iso: "AU", flag: "🇦🇺", dial: "+61", name: "Australia" },
  { iso: "HK", flag: "🇭🇰", dial: "+852", name: "Hong Kong" },
  { iso: "ID", flag: "🇮🇩", dial: "+62", name: "Indonesia" },
  { iso: "TH", flag: "🇹🇭", dial: "+66", name: "Thailand" },
  { iso: "MY", flag: "🇲🇾", dial: "+60", name: "Malaysia" },
  { iso: "NZ", flag: "🇳🇿", dial: "+64", name: "New Zealand" },
  { iso: "QA", flag: "🇶🇦", dial: "+974", name: "Qatar" },
  { iso: "SA", flag: "🇸🇦", dial: "+966", name: "Saudi Arabia" },
  { iso: "OM", flag: "🇴🇲", dial: "+968", name: "Oman" },
  { iso: "BH", flag: "🇧🇭", dial: "+973", name: "Bahrain" },
  { iso: "KW", flag: "🇰🇼", dial: "+965", name: "Kuwait" },
  { iso: "IE", flag: "🇮🇪", dial: "+353", name: "Ireland" },
  { iso: "DE", flag: "🇩🇪", dial: "+49", name: "Germany" },
  { iso: "FR", flag: "🇫🇷", dial: "+33", name: "France" },
  { iso: "CH", flag: "🇨🇭", dial: "+41", name: "Switzerland" },
  { iso: "NL", flag: "🇳🇱", dial: "+31", name: "Netherlands" },
  { iso: "ES", flag: "🇪🇸", dial: "+34", name: "Spain" },
  { iso: "IT", flag: "🇮🇹", dial: "+39", name: "Italy" },
  { iso: "ZA", flag: "🇿🇦", dial: "+27", name: "South Africa" },
  { iso: "JP", flag: "🇯🇵", dial: "+81", name: "Japan" },
  { iso: "CN", flag: "🇨🇳", dial: "+86", name: "China" },
  { iso: "PH", flag: "🇵🇭", dial: "+63", name: "Philippines" },
  { iso: "LK", flag: "🇱🇰", dial: "+94", name: "Sri Lanka" },
  { iso: "PK", flag: "🇵🇰", dial: "+92", name: "Pakistan" },
  { iso: "BD", flag: "🇧🇩", dial: "+880", name: "Bangladesh" },
  { iso: "NP", flag: "🇳🇵", dial: "+977", name: "Nepal" },
];

/** Longest code wins, so +971 is never read as +97. */
function splitPhone(value: string): { iso: string; rest: string } {
  const trimmed = value.trim();
  const match = [...DIAL_CODES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((entry) => trimmed.startsWith(entry.dial));
  if (!match) return { iso: "GB", rest: trimmed };
  return { iso: match.iso, rest: trimmed.slice(match.dial.length).trim() };
}

/**
 * A number we can actually ring.
 *
 * Asking for "your number, including the country code" gets you a number
 * without the country code — from a guest in Dubai, which is the one case
 * where it matters. Pick the flag, type the rest.
 */
function PhoneField({
  value,
  onChange,
}: {
  value: string;
  onChange(value: string): void;
}) {
  const parsed = splitPhone(value);
  const [iso, setIso] = React.useState(parsed.iso);
  const country = DIAL_CODES.find((entry) => entry.iso === iso) ?? DIAL_CODES[0];

  const emit = (nextIso: string, rest: string) => {
    const dial = DIAL_CODES.find((entry) => entry.iso === nextIso)?.dial ?? "+44";
    onChange(rest.trim() === "" ? "" : `${dial} ${rest.trim()}`);
  };

  const shared =
    "min-h-[48px] rounded-2xl border border-[#d9d4cb] bg-[#fbfaf7] text-[16px] text-[#2d332d] " +
    "outline-none transition-all duration-300 focus:border-[#6d8373] focus:bg-white " +
    "focus:shadow-[0_0_0_3px_rgba(109,131,115,0.13)] sm:min-h-[44px] sm:text-[14px]";

  return (
    // min-w-0: a grid item won't shrink below its content's minimum width, and
    // an <input> reports that as its intrinsic size="20" — about 336px at this
    // font, which is wider than the column and hangs off the right of the card.
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-baseline gap-1.5 text-[13.5px] font-medium text-[#66645d]">
        Mobile number
        <span className="text-[11.5px] font-normal uppercase tracking-[0.08em] text-[#a4503f]">
          Required
        </span>
      </span>
      <span className="flex gap-2">
        <span className="relative shrink-0">
          <select
            value={iso}
            aria-label="Country dialling code"
            onChange={(event) => {
              setIso(event.target.value);
              emit(event.target.value, parsed.rest);
            }}
            className={`${shared} w-[112px] appearance-none px-3 pr-7`}
          >
            {DIAL_CODES.map((entry) => (
              <option key={entry.iso} value={entry.iso}>
                {entry.flag} {entry.dial}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8b877f]"
            width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden
          >
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <input
          value={parsed.rest}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder={country.iso === "GB" ? "7700 900123" : "Your number"}
          onChange={(event) => emit(iso, event.target.value)}
          className={`${shared} min-w-0 flex-1 px-4 py-2.5`}
        />
      </span>
    </label>
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
    "min-h-[48px] w-full rounded-2xl border border-[#d9d4cb] bg-[#fbfaf7] px-4 py-2.5 text-[16px] text-[#2d332d] sm:min-h-[44px] sm:text-[14px] " +
    "placeholder:text-[#aaa59b] outline-none transition-all duration-300 " +
    "focus:border-[#6d8373] focus:bg-white focus:shadow-[0_0_0_3px_rgba(109,131,115,0.13)]";

  return (
    // See PhoneField: without min-w-0 the input's intrinsic 20-character width
    // becomes the column's minimum and overflows the card.
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[13.5px] font-medium text-[#66645d]">{label}</span>
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
  const celebrating = coming > 0;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-[28px] border border-[#d8d4cb] bg-white/78 px-6 py-10 text-center shadow-[0_30px_80px_-48px_rgba(43,45,39,0.5)] sm:px-10 sm:py-14"
    >
      <motion.span
        initial={reduce ? false : { scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 20, delay: 0.15 }}
        className={cn(
          "mb-6 inline-flex h-14 w-14 items-center justify-center rounded-full text-white",
          celebrating ? "bg-[#294436]" : "bg-[#8b7160]",
        )}
      >
        <CheckIcon size={24} />
      </motion.span>

      <Ornament />

      <h2 className="font-display text-[30px] leading-[1.12] text-[#2d332d] sm:text-[44px]">
        {celebrating ? "We can't wait" : "We'll miss you"}
      </h2>

      <p className="mx-auto mt-4 max-w-[25rem] text-[15px] leading-relaxed text-[#716f68] sm:text-[14.5px]">
        {celebrating
          ? total === 1
            ? "We’re so happy you’ll be there. We’ll be in touch with everything you need for Bali."
            : coming === total
              ? "We’re so happy you can all be there. We’ll be in touch with everything you need for Bali."
              : `${coming} of you are joining us. We’ll be in touch with everything you need for Bali.`
          : "We’re so sorry you can’t be with us — you’ll be missed more than you know. If anything changes, this link still works."}
      </p>

      <motion.p
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.4, delay: 0.6 }}
        className="mt-8 font-script text-[28px] text-[#455e4c]"
      >
        {partnerA} <span className="text-[#c98d72]">&</span> {partnerB}
      </motion.p>

      <button
        type="button"
        onClick={onChange}
        className="mt-8 text-[13.5px] text-[#817d75] underline-offset-4 transition-colors hover:text-[#2d332d] hover:underline"
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
