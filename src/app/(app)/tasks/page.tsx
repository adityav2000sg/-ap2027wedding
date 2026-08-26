import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { analyseTasks } from "@/domain/tasks";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { toTaskRow } from "@/components/wedding/task-row-data";
import { TasksWorkspace } from "./workspace";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; task?: string; owner?: string; event?: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const params = await searchParams;
  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);

  const memberLookup = new Map(
    snapshot.members.map((m) => [m.id, { name: m.name, tone: m.avatarTone }]),
  );
  const eventLookup = new Map(
    snapshot.events.map((e) => [e.id, { name: e.name, tone: e.accentTone }]),
  );
  const lookup = { members: memberLookup, events: eventLookup, currency: viewer.displayCurrency };

  const areas = [...new Set(tasks.map((t) => t.area).filter(Boolean))] as string[];

  return (
    <TasksWorkspace
      canEdit={viewer.permissions.has("tasks.edit")}
      viewerMemberId={viewer.memberId}
      initialView={params.view ?? "open"}
      initialTaskId={params.task ?? null}
      initialOwner={params.owner ?? null}
      initialEvent={params.event ?? null}
      areas={areas.sort()}
      members={snapshot.members.map((m) => ({
        id: m.id, name: m.name, tone: m.avatarTone, relation: m.relation,
      }))}
      events={snapshot.events.map((e) => ({
        id: e.id, name: e.name, tone: e.accentTone,
      }))}
      tasks={tasks.map((task) => ({
        ...toTaskRow(task, lookup),
        ownerId: task.ownerId,
        eventId: task.eventId,
        description: task.description,
        phase: task.phase,
        leverage: task.leverage,
        blockedBy: task.blockedBy,
        blocking: task.blocking,
      }))}
      stats={{
        total: tasks.length,
        done: tasks.filter((t) => t.isDone).length,
        overdue: tasks.filter((t) => t.isOverdue).length,
        blocked: tasks.filter((t) => t.isBlocked && !t.isDone).length,
        mine: tasks.filter((t) => t.ownerId === viewer.memberId && !t.isDone).length,
        unassigned: tasks.filter((t) => !t.ownerId && !t.isDone).length,
      }}
      readinessPercent={
        budget.finance.forecast >= 0
          ? Math.round(
              (tasks.filter((t) => t.isDone).length / Math.max(1, tasks.length)) * 100,
            )
          : 0
      }
    />
  );
}
