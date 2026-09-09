import { redirect } from "next/navigation";

import { buildBudgetView } from "@/domain/budget";
import { computeAlerts } from "@/domain/risk";
import { analyseTasks } from "@/domain/tasks";
import { isAiConfigured } from "@/server/ai/qwen";
import { getViewer } from "@/server/auth";
import { loadSnapshot } from "@/server/snapshot";
import { AiPlanner } from "./planner";

export default async function AiPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const snapshot = await loadSnapshot(viewer.weddingId);
  const tasks = analyseTasks(snapshot);
  const budget = buildBudgetView(snapshot, viewer.displayCurrency);
  const alerts = computeAlerts(snapshot, tasks, budget);
  const canSeeMoney = viewer.permissions.has("budget.view");

  // Suggestions drawn from what's actually wrong right now, not a static list.
  // A few of them ask for work rather than an answer, because the planner can
  // now do the work — everything it suggests still waits for approval.
  const canEdit =
    viewer.permissions.has("tasks.edit") || viewer.permissions.has("guests.edit");
  const suggestions = [
    "What are we forgetting?",
    "What should we focus on this week?",
    ...(canEdit ? ["Set up the tasks we need before the venue is booked."] : []),
    ...(alerts.some((a) => a.group === "vendors")
      ? ["Which vendors still need contracts?"] : []),
    ...(canSeeMoney
      ? [
          "What will this wedding actually cost?",
          "What happens if we invite another 50 guests?",
        ]
      : []),
    ...(canEdit ? ["Chase every household that hasn't replied yet."] : []),
    "Which areas are furthest behind?",
    "Does our room plan cover everyone?",
  ].slice(0, 7);

  return (
    <AiPlanner
      configured={isAiConfigured()}
      viewerName={viewer.name}
      canSeeMoney={canSeeMoney}
      suggestions={suggestions}
      currency={viewer.displayCurrency}
    />
  );
}
