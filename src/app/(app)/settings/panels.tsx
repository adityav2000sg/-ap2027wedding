"use client";

import * as React from "react";

import { TRADITIONS } from "@/domain/task-library";
import { Badge } from "@/components/ui/primitives";

/**
 * Traditions and system status.
 *
 * Traditions are shown because they genuinely drive which tasks exist — the
 * baraat tasks only appear because the family observes a baraat.
 */
export function SettingsPanels({
  traditions,
  rsvpEnabled,
  canConfigure,
  aiConfigured,
}: {
  traditions: string[];
  rsvpEnabled: boolean;
  canConfigure: boolean;
  aiConfigured: boolean;
}) {
  const enabled = new Set(traditions);

  return (
    <>
      <section className="mb-9">
        <div className="rule-heading mb-4">
          <h2 className="font-display text-[19px] text-ink">Rituals you're observing</h2>
        </div>
        <p className="mb-4 max-w-lg text-[13px] leading-relaxed text-ink-muted">
          These decide which tasks the plan generates. The baraat tasks exist
          because you've said there's a baraat — families differ, and nothing is
          assumed.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TRADITIONS.map((tradition) => (
            <span
              key={tradition.key}
              title={tradition.description}
              className={
                enabled.has(tradition.key)
                  ? "rounded-full border border-saffron/25 bg-saffron-soft px-2.5 py-1 text-[12px] text-saffron"
                  : "rounded-full border border-line px-2.5 py-1 text-[12px] text-ink-faint"
              }
            >
              {tradition.label}
            </span>
          ))}
        </div>
        {!canConfigure ? (
          <p className="mt-3 text-[11.5px] text-ink-faint">
            Only the couple can change these.
          </p>
        ) : null}
      </section>

      <section>
        <div className="rule-heading mb-4">
          <h2 className="font-display text-[19px] text-ink">System</h2>
        </div>
        <dl className="space-y-2.5">
          <Row label="Public RSVP pages">
            <Badge size="xs" variant={rsvpEnabled ? "positive" : "neutral"}>
              {rsvpEnabled ? "Enabled" : "Off"}
            </Badge>
          </Row>
          <Row label="AI Planner">
            <Badge size="xs" variant={aiConfigured ? "positive" : "neutral"}>
              {aiConfigured ? "Connected" : "No API key"}
            </Badge>
          </Row>
        </dl>
      </section>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-line pb-2.5 last:border-b-0">
      <dt className="text-[13.5px] text-ink-soft">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
