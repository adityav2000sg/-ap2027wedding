import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { daysBetween, formatMinute } from "@/lib/dates";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Avantika & Prateek | Bali 2027",
  description: "Join Avantika and Prateek at Conrad Bali, 16–19 June 2027.",
};

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const longDayFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export default async function GuestHomePage() {
  const wedding = await db.wedding.findFirst({
    orderBy: { createdAt: "asc" },
    select: {
      partnerAName: true,
      partnerBName: true,
      startDate: true,
      endDate: true,
      cities: true,
      events: {
        where: { archivedAt: null, isPrivate: false },
        orderBy: [{ date: "asc" }, { sortOrder: "asc" }],
        select: {
          id: true,
          name: true,
          date: true,
          startMinute: true,
          description: true,
          dressCode: true,
          venue: {
            select: { name: true, address: true, city: true },
          },
        },
      },
    },
  });

  if (!wedding) notFound();

  const partnerA = wedding.partnerAName;
  const partnerB = wedding.partnerBName;
  const days = daysBetween(new Date(), wedding.startDate);
  const venue = wedding.events.find((event) => event.venue)?.venue;
  const location = wedding.cities[0] ?? "Bali";

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f4f0e9] text-[#2b2d28] selection:bg-[#d9a285]/40">
      <header id="top" className="relative min-h-[760px] overflow-hidden sm:min-h-[820px] lg:min-h-screen">
        <Image
          src="/brand/proposal.jpg"
          alt={`${partnerA} and ${partnerB} in Bali`}
          fill
          priority
          sizes="100vw"
          className="object-cover object-[58%_center] sm:object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-[#151813]/28" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-[#10140f]/42 via-transparent to-[#10140f]/76"
        />

        <nav className="absolute left-1/2 top-5 z-20 flex w-[calc(100%-32px)] max-w-[760px] -translate-x-1/2 items-center justify-between rounded-[22px] border border-white/45 bg-[#fffdf8]/92 p-1.5 pl-4 shadow-[0_16px_50px_-28px_rgba(0,0,0,0.7)] backdrop-blur-md sm:top-8 sm:rounded-[26px] sm:pl-5">
          <a href="#top" className="font-display text-[20px] leading-none text-[#23362b]">
            A<span className="px-0.5 text-[#c87958]">&</span>P
          </a>
          <div className="flex items-center gap-1 text-[15px] font-medium text-[#4e554d] sm:gap-2">
            <a href="#celebration" className="hidden rounded-full px-3 py-2 hover:bg-[#ede9e1] sm:block">
              Celebration
            </a>
            <a href="#bali" className="hidden rounded-full px-3 py-2 hover:bg-[#ede9e1] sm:block">
              Conrad Bali
            </a>
            <a
              href="#reply"
              className="rounded-[17px] bg-[#2b4637] px-4 py-2.5 text-white transition-colors hover:bg-[#1f3428] sm:px-5"
            >
              Your reply
            </a>
          </div>
        </nav>

        <div className="absolute inset-x-0 bottom-0 z-10 px-5 pb-12 text-white sm:px-10 sm:pb-16 lg:px-14 lg:pb-14">
          <div className="mx-auto max-w-[1320px]">
            <p className="mb-4 text-[15px] font-medium uppercase tracking-[0.2em] text-white/78">
              The wedding of
            </p>
            <h1 className="max-w-[1200px] font-display text-[clamp(62px,12vw,168px)] leading-[0.78] tracking-[-0.06em] text-white">
              <span className="block">{partnerA}</span>
              <span className="block pl-[10vw] sm:inline sm:pl-0">
                <span className="mx-2 text-[#e2a084] sm:mx-5">&</span>{partnerB}
              </span>
            </h1>
            <div className="mt-8 flex flex-col gap-1 border-t border-white/35 pt-4 text-[16px] text-white/88 sm:flex-row sm:items-center sm:justify-between sm:text-[18px]">
              <p>16–19 June 2027</p>
              <p>{location}, Indonesia</p>
            </div>
          </div>
        </div>
      </header>

      <section className="px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <div className="mx-auto grid max-w-[1180px] items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-20">
          <div className="relative mx-auto aspect-[4/5.35] w-full max-w-[420px] rotate-[-1.5deg] overflow-hidden border-[10px] border-[#fbf9f4] bg-white shadow-[0_30px_80px_-40px_rgba(44,55,45,0.45)] sm:border-[14px]">
            <Image
              src="/brand/save-the-date.jpeg"
              alt={`Save the date for ${partnerA} and ${partnerB}`}
              fill
              sizes="(max-width: 1024px) 90vw, 420px"
              className="object-cover"
            />
          </div>

          <div>
            <p className="text-[15px] font-semibold uppercase tracking-[0.2em] text-[#9a6c50]">
              Save the date
            </p>
            <h2 className="mt-5 max-w-[700px] font-display text-[clamp(44px,6vw,76px)] leading-[0.98] tracking-[-0.045em] text-[#24372d]">
              Four days together in Bali
            </h2>
            <p className="mt-7 max-w-[610px] text-[18px] leading-[1.75] text-[#5f645d]">
              We’re getting married at Conrad Bali from 16–19 June 2027. We would love you to join us for the whole celebration.
            </p>

            <div className="mt-10 grid grid-cols-4 divide-x divide-[#c9c2b7] border-y border-[#c9c2b7] py-5">
              {[16, 17, 18, 19].map((day) => (
                <div key={day} className="px-2 text-center sm:px-4">
                  <p className="font-display text-[30px] text-[#24372d] sm:text-[40px]">{day}</p>
                  <p className="mt-1 text-[15px] uppercase tracking-[0.12em] text-[#777b74]">Jun</p>
                </div>
              ))}
            </div>

            <p className="mt-7 text-[16px] text-[#777b74]">
              {days > 0 ? `${days} days to go` : "The celebration is here"}
            </p>
          </div>
        </div>
      </section>

      <section id="celebration" className="scroll-mt-8 border-y border-[#d7d0c5] bg-[#ede9e1] px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="mx-auto max-w-[720px] text-center">
            <p className="text-[15px] font-semibold uppercase tracking-[0.2em] text-[#9a6c50]">The celebration</p>
            <h2 className="mt-4 font-display text-[clamp(44px,6vw,72px)] leading-none tracking-[-0.045em] text-[#24372d]">
              The week at a glance
            </h2>
            <p className="mx-auto mt-6 max-w-[560px] text-[17px] leading-relaxed text-[#696d66]">
              Every guest is invited to every celebration. Detailed timings and dress notes will come with the invitation.
            </p>
          </div>

          <div className="relative mx-auto mt-14 max-w-[860px] before:absolute before:bottom-0 before:left-[72px] before:top-0 before:w-px before:bg-[#a9b4a8] sm:before:left-[154px]">
            {wedding.events.map((event, index) => (
              <article
                key={event.id}
                className="relative grid grid-cols-[72px_1fr] gap-6 pb-12 last:pb-0 sm:grid-cols-[154px_1fr] sm:gap-12"
              >
                <div className="pr-4 text-right sm:pr-7">
                  <p className="text-[15px] font-semibold uppercase leading-snug tracking-[0.08em] text-[#737a71]">
                    {dayFormat.format(event.date)}
                  </p>
                  <p className="mt-2 hidden text-[15px] text-[#8a8d86] sm:block">
                    {formatMinute(event.startMinute)}
                  </p>
                </div>
                <span
                  aria-hidden
                  className="absolute left-[66px] top-0.5 h-3.5 w-3.5 rounded-full border-[3px] border-[#ede9e1] bg-[#c87958] ring-1 ring-[#8b9c8c] sm:left-[148px]"
                />
                <div className="pl-1">
                  <p className="text-[15px] font-medium text-[#9a6c50]">0{index + 1}</p>
                  <h3 className="mt-1 font-display text-[34px] leading-none tracking-[-0.035em] text-[#26382f] sm:text-[43px]">
                    {event.name}
                  </h3>
                  {event.description ? (
                    <p className="mt-3 max-w-[540px] text-[16px] leading-relaxed text-[#686d65]">
                      {event.description}
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="bali" className="relative min-h-[760px] scroll-mt-8 overflow-hidden">
        <Image
          src="/brand/conrad-bali.webp"
          alt="Conrad Bali resort and beach"
          fill
          sizes="100vw"
          className="object-cover object-[58%_center] sm:object-center"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-[#132019]/18 via-[#132019]/24 to-[#132019]/62" />
        <div className="relative mx-auto flex min-h-[760px] max-w-[1240px] items-end justify-center px-5 py-14 sm:justify-start sm:px-10 sm:py-20">
          <div className="w-full max-w-[580px] rounded-[34px] border border-white/55 bg-[#faf7f0]/94 p-7 text-center shadow-[0_30px_90px_-40px_rgba(0,0,0,0.7)] backdrop-blur-md sm:p-11">
            <p className="text-[15px] font-semibold uppercase tracking-[0.2em] text-[#9a6c50]">The location</p>
            <h2 className="mt-4 font-display text-[50px] leading-[0.95] tracking-[-0.045em] text-[#24372d] sm:text-[68px]">
              Conrad Bali
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-[#60665e]">
              The entire wedding takes place at the resort, so once you arrive, every celebration is right here.
            </p>
            <div className="mx-auto mt-7 h-px w-20 bg-[#c8a087]" />
            <p className="mt-6 text-[16px] leading-relaxed text-[#73776f]">
              {venue?.address ?? "Jalan Pratama 168, Tanjung Benoa"}<br />
              {venue?.city ?? "Bali, Indonesia"}
            </p>
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 sm:py-28 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="max-w-[720px]">
            <p className="text-[15px] font-semibold uppercase tracking-[0.2em] text-[#9a6c50]">Guest information</p>
            <h2 className="mt-4 font-display text-[clamp(44px,6vw,72px)] leading-none tracking-[-0.045em] text-[#24372d]">
              The useful bits
            </h2>
          </div>

          <div className="mt-12 grid gap-px overflow-hidden rounded-[28px] border border-[#d7d0c5] bg-[#d7d0c5] md:grid-cols-3">
            <InfoCard number="01" title="Stay at Conrad">
              We’re planning rooms for our guests at Conrad Bali. Booking information will be shared directly with you.
            </InfoCard>
            <InfoCard number="02" title="Everything is here">
              All five celebrations take place at the resort. There is no venue-to-venue travel to organise.
            </InfoCard>
            <InfoCard number="03" title="Fly into DPS">
              Ngurah Rai International Airport is the closest airport. Conrad Bali is around 20 minutes away by car.
            </InfoCard>
          </div>

          <div className="mt-20 grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <p className="text-[15px] font-semibold uppercase tracking-[0.2em] text-[#9a6c50]">Questions</p>
              <h2 className="mt-4 font-display text-[44px] leading-none tracking-[-0.04em] text-[#24372d] sm:text-[56px]">
                Good to know
              </h2>
            </div>
            <div className="divide-y divide-[#d1c9bd] border-y border-[#d1c9bd]">
              <Faq question="Which events am I invited to?">
                All of them. Your invitation is for the full celebration from 16–19 June.
              </Faq>
              <Faq question="Where should I stay?">
                At Conrad Bali with the rest of the wedding party. Room and booking details will be sent directly.
              </Faq>
              <Faq question="When do I need to reply?">
                Please reply to the save-the-date by 1 October 2026 using the private link sent to you.
              </Faq>
              <Faq question="When will I get the detailed programme?">
                The formal invitation will include confirmed timings, dress notes and the rest of the travel information.
              </Faq>
            </div>
          </div>
        </div>
      </section>

      <section id="reply" className="scroll-mt-8 bg-[#294436] px-5 py-20 text-center text-white sm:px-8 sm:py-28">
        <div className="mx-auto max-w-[760px]">
          <p className="text-[15px] font-semibold uppercase tracking-[0.2em] text-[#e1a185]">Your reply</p>
          <h2 className="mt-5 font-display text-[clamp(44px,7vw,78px)] leading-[0.98] tracking-[-0.045em] text-white">
            We hope you’ll be there
          </h2>
          <p className="mx-auto mt-7 max-w-[610px] text-[18px] leading-relaxed text-white/72">
            Your save-the-date message includes a private reply link for you or your group. Open that link to let us know by 1 October 2026.
          </p>
          <div className="mx-auto mt-10 inline-flex items-center gap-3 rounded-full border border-white/25 bg-white/8 px-5 py-3 text-[15px] text-white/76">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#e1a185]" />
            One reply covers the whole wedding
          </div>
        </div>
      </section>

      <footer className="bg-[#1e3127] px-5 py-10 text-center text-white">
        <p className="font-display text-[32px] tracking-[-0.035em]">
          {partnerA} <span className="text-[#e1a185]">&</span> {partnerB}
        </p>
        <p className="mt-2 text-[15px] text-white/55">16–19 June 2027 · Conrad Bali</p>
      </footer>
    </main>
  );
}

function InfoCard({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="min-h-[280px] bg-[#fbf8f2] p-7 sm:p-9">
      <p className="text-[15px] font-semibold text-[#b37657]">{number}</p>
      <h3 className="mt-12 font-display text-[31px] leading-none tracking-[-0.035em] text-[#24372d]">{title}</h3>
      <p className="mt-5 text-[16px] leading-[1.7] text-[#686d65]">{children}</p>
    </article>
  );
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group py-6">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-5 font-display text-[23px] leading-tight text-[#2d382f] marker:hidden">
        {question}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#bdb3a5] font-sans text-[20px] font-light transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="max-w-[650px] pt-4 text-[16px] leading-relaxed text-[#686d65]">{children}</p>
    </details>
  );
}
