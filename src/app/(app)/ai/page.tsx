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
  const suggestions = [
    "What are we forgetting?",
    "What should we focus on this week?",
    ...(alerts.some((a) => a.group === "vendors")
      ? ["Which vendors still need contracts?"] : []),
    ...(canSeeMoney
      ? [
          "What will this wedding actually cost?",
          "What happens if we invite another 50 guests?",
          "Where could we save money without cutting the venue?",
        ]
      : []),
    "Which areas are furthest behind?",
    "Build the agenda for our family planning call.",
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
