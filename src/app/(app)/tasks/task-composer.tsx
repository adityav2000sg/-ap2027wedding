"use client";

/**
 * Making a task, and handing it to somebody.
 *
 * Delegation is the point. The owner is who it's on; tagged people are kept in
 * the loop without inheriting the obligation. Both get told, in different
 * words, because being given a job and being cc'd on one are different things.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/cn";
import { Avatar, Button } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/overlays";
import { FormField, Input, Select, Textarea } from "@/components/ui/form";
import { createTask } from "@/server/actions/tasks";

export interface Member {
  id: string;
  name: string;
  tone: string;
  relation?: string;
}

export function TaskComposer({
  open,
  onOpenChange,
  members,
  events,
  viewerMemberId,
  defaultOwnerId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  members: Member[];
  events: { id: string; name: string }[];
  viewerMemberId: string;
  defaultOwnerId?: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [ownerId, setOwnerId] = React.useState(defaultOwnerId ?? viewerMemberId);
  const [tagged, setTagged] = React.useState<string[]>([]);
  const [priority, setPriority] = React.useState("MEDIUM");
  const [dueDate, setDueDate] = React.useState("");
  const [eventId, setEventId] = React.useState("");

  function reset() {
    setTitle("");
    setDescription("");
    setOwnerId(defaultOwnerId ?? viewerMemberId);
    setTagged([]);
    setPriority("MEDIUM");
    setDueDate("");
    setEventId("");
    setError(null);
  }

  async function submit() {
    if (!title.trim()) {
      setError("Give the task a name.");
      return;
    }
    setPending(true);
    setError(null);

    const result = await createTask({
      title,
      description: description || undefined,
      ownerId: ownerId || undefined,
      collaboratorIds: tagged,
      priority,
      dueDate: dueDate || undefined,
      eventId: eventId || undefined,
    });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    reset();
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="New task"
      description="Give it to someone, and tag anyone who should know."
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink-muted">
            {ownerId === viewerMemberId ? "You'll own this" : "They'll be notified"}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Creating…" : "Create task"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <FormField label="What needs doing?" htmlFor="nt-title" required>
          <Input
            id="nt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Book the mehendi artist"
            autoFocus
          />
        </FormField>

        <FormField label="Any detail" htmlFor="nt-desc">
          <Textarea
            id="nt-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Anything the person picking this up would need to know."
          />
        </FormField>

        <FormField label="Who's handling this?" htmlFor="nt-owner">
          <Select id="nt-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Nobody yet</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.id === viewerMemberId ? " (you)" : ""}
              </option>
            ))}
          </Select>
        </FormField>

        <PeoplePicker
          label="Tag anyone else who should know"
          members={members.filter((m) => m.id !== ownerId)}
          selected={tagged}
          onChange={setTagged}
        />

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Priority" htmlFor="nt-priority">
            <Select
              id="nt-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            >
              <option value="CRITICAL">Critical</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </Select>
          </FormField>

          <FormField label="Due" htmlFor="nt-due">
            <Input
              id="nt-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Part of which function?" htmlFor="nt-event">
          <Select id="nt-event" value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="">Not tied to one</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </Select>
        </FormField>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-critical/20 bg-critical-soft px-3 py-2 text-[12.5px] text-critical"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

/**
 * Tagging people.
 *
 * Faces rather than a multi-select, because nine people is few enough to show
 * all at once and recognising a face beats reading a list.
 */
export function PeoplePicker({
  label,
  members,
  selected,
  onChange,
  disabled,
}: {
  label: string;
  members: Member[];
  selected: string[];
  onChange(next: string[]): void;
  disabled?: boolean;
}) {
  function toggle(id: string) {
    if (disabled) return;
    onChange(selected.includes(id) ? selected.filter((m) => m !== id) : [...selected, id]);
  }

  return (
    <div>
      <p className="mb-1.5 text-[12px] font-medium text-ink-soft">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {members.map((member) => {
          const on = selected.includes(member.id);
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => toggle(member.id)}
              disabled={disabled}
              aria-pressed={on}
              className={cn(
                "flex min-h-[36px] items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 text-[12.5px] transition-colors",
                on
                  ? "border-saffron/40 bg-saffron-soft text-saffron"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink",
                disabled && "cursor-default opacity-60",
              )}
            >
              <Avatar name={member.name} tone={member.tone} size="xs" />
              {member.name.split(" ")[0]}
            </button>
          );
        })}
        {members.length === 0 ? (
          <p className="text-[12px] text-ink-faint">Nobody else to tag.</p>
        ) : null}
      </div>
    </div>
  );
}
