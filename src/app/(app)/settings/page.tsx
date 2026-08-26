import { redirect } from "next/navigation";

import { formatDateRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Avatar, Badge } from "@/components/ui/primitives";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/server/permissions";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { SettingsPanels } from "./panels";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);

  // Latest rate per pair, so the table shows what's actually in use.
  const latestRates = new Map<string, { from: string; to: string; rate: number; on: Date }>();
  for (const rate of snapshot.rates) {
    const key = `${rate.fromCurrency}->${rate.toCurrency}`;
    const existing = latestRates.get(key);
    if (!existing || new Date(rate.effectiveDate) > existing.on) {
      latestRates.set(key, {
        from: rate.fromCurrency,
        to: rate.toCurrency,
        rate: rate.rate,
        on: new Date(rate.effectiveDate),
      });
    }
  }

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
      <header className="mb-8">
        <div className="eyebrow mb-2">How this is set up</div>
        <h1 className="font-display text-[34px] leading-tight text-ink">Settings</h1>
      </header>

      {/* The wedding */}
      <section className="mb-9">
        <div className="rule-heading mb-4">
          <h2 className="font-display text-[19px] text-ink">The wedding</h2>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
          <Fact label="Couple">
            {snapshot.wedding.partnerAName} & {snapshot.wedding.partnerBName}
          </Fact>
          <Fact label="Dates">
            {formatDateRange(snapshot.wedding.startDate, snapshot.wedding.endDate)}
          </Fact>
          <Fact label="Type">{snapshot.wedding.weddingType}</Fact>
          <Fact label="Where">
            {snapshot.wedding.cities.length > 0
              ? snapshot.wedding.cities.join(" or ")
              : "Not decided"}
          </Fact>
          <Fact label="Budget">
            {formatMoney(snapshot.wedding.totalBudget, snapshot.wedding.baseCurrency)}
          </Fact>
          <Fact label="Guests planned for">{snapshot.wedding.estimatedGuests}</Fact>
        </dl>
        <p className="mt-4 max-w-lg text-[12.5px] leading-relaxed text-ink-muted">
          The dates are a working target — nothing is contracted against them yet.
          Changing them will offer to re-date every generated deadline rather than
          silently shifting your work.
        </p>
      </section>

      {/* People */}
      <section className="mb-9">
        <div className="rule-heading mb-4">
          <h2 className="font-display text-[19px] text-ink">Who has access</h2>
        </div>
        <ul>
          {snapshot.members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-3 border-b border-line py-3 last:border-b-0"
            >
              <Avatar name={member.name} tone={member.avatarTone} size="md" />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink">
                  {member.name}
                  {member.userId === viewer.userId ? (
                    <span className="ml-2 text-[11px] text-ink-faint">you</span>
                  ) : null}
                </span>
                <span className="block text-[11.5px] text-ink-muted">
                  {member.relation} · {member.email}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Badge size="xs">{ROLE_LABEL[member.role]}</Badge>
                <span className="mt-1 hidden max-w-[220px] text-[10.5px] leading-snug text-ink-faint sm:block">
                  {ROLE_DESCRIPTION[member.role]}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Currency */}
      <section className="mb-9">
        <div className="rule-heading mb-4">
          <h2 className="font-display text-[19px] text-ink">Currency</h2>
        </div>
        <p className="mb-4 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          Amounts are stored in whatever currency they were entered in and
          converted for display. Each person picks their own — you're reading in{" "}
          <span className="font-medium text-ink">{viewer.displayCurrency}</span>,
          changeable from the rail at the bottom left.
        </p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
          {[...latestRates.values()]
            .filter((r) => r.to === viewer.displayCurrency)
            .map((rate) => (
              <div key={`${rate.from}-${rate.to}`} className="flex justify-between text-[13px]">
                <span className="text-ink-muted">1 {rate.from}</span>
                <span className="tabular text-ink">
                  {rate.rate < 0.01 ? rate.rate.toFixed(5) : rate.rate.toFixed(2)} {rate.to}
                </span>
              </div>
            ))}
        </div>
      </section>

      <SettingsPanels
        traditions={snapshot.wedding.traditions}
        rsvpEnabled={snapshot.wedding.rsvpEnabled}
        canConfigure={viewer.permissions.has("wedding.configure")}
        aiConfigured={Boolean(process.env.QWEN_API_KEY)}
      />
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-medium tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 text-[14px] text-ink">{children}</dd>
    </div>
  );
}
