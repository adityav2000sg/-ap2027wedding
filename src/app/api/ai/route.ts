import { NextResponse } from "next/server";

import { logActivity } from "@/server/activity";
import { getViewer } from "@/server/auth";
import { db } from "@/server/db";
import { loadSnapshot } from "@/server/snapshot";
import { AiUnavailableError, chat, isAiConfigured, type ChatMessage } from "@/server/ai/qwen";
import { TOOL_DEFINITIONS, buildSystemPrompt, runTool } from "@/server/ai/tools";
import { PROPOSE_TOOL, recordProposal, type RecordedProposal } from "@/server/ai/proposals";

export const maxDuration = 60;

/** Stops a runaway tool loop from burning the quota. */
const MAX_TOOL_ROUNDS = 4;

/** Crude per-process rate limit — enough to stop an accidental loop. */
const recentCalls = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 12;

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const calls = (recentCalls.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  calls.push(now);
  recentCalls.set(userId, calls);
  return calls.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) {
    return NextResponse.json({ error: "You need to be signed in." }, { status: 401 });
  }
  if (!viewer.permissions.has("ai.use")) {
    return NextResponse.json(
      { error: "Your account doesn't have access to the AI Planner." },
      { status: 403 },
    );
  }
  if (!isAiConfigured()) {
    return NextResponse.json(
      {
        error:
          "The AI Planner isn't configured yet — no Qwen API key is set. Everything else in the app works without it.",
      },
      { status: 503 },
    );
  }
  if (rateLimited(viewer.userId)) {
    return NextResponse.json(
      { error: "That's a lot of questions at once. Give it a minute." },
      { status: 429 },
    );
  }

  let body: { message?: string; history?: { role: string; content: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const question = (body.message ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Ask a question first." }, { status: 400 });
  }
  if (question.length > 2000) {
    return NextResponse.json({ error: "That question is too long." }, { status: 400 });
  }

  const snapshot = await loadSnapshot(viewer.weddingId);

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt(snapshot, viewer) },
    // Only the last few turns — the tools carry the facts, not the transcript.
    ...(body.history ?? [])
      .slice(-6)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: question },
  ];

  const toolsUsed: string[] = [];
  const proposals: RecordedProposal[] = [];

  // The model may only propose changes it has permission to make.
  const canPropose =
    viewer.permissions.has("ai.execute") ||
    viewer.permissions.has("tasks.edit");
  const tools = canPropose ? [...TOOL_DEFINITIONS, PROPOSE_TOOL] : TOOL_DEFINITIONS;

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const result = await chat(messages, tools);

      if (result.toolCalls.length === 0) {
        const answer = result.content.trim();

        await logActivity({
          weddingId: viewer.weddingId,
          actorId: viewer.userId,
          source: "AI",
          entityType: "ai",
          action: "asked",
          summary: `${viewer.name} asked the AI Planner: "${question.slice(0, 120)}${question.length > 120 ? "…" : ""}"`,
          after: { toolsUsed },
        });

        return NextResponse.json({ answer, toolsUsed, proposals });
      }

      // Record the assistant's tool-call turn, then answer each call.
      messages.push({
        role: "assistant",
        content: result.content ?? "",
        tool_calls: result.toolCalls,
      });

      for (const call of result.toolCalls) {
        let output: string;
        try {
          const args = call.function.arguments
            ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
            : {};

          if (call.function.name === "propose_change") {
            const recorded = await recordProposal(args, viewer, null);
            if (recorded.proposal) proposals.push(recorded.proposal);
            output = recorded.toolOutput;
          } else {
            output = await runTool(call.function.name, args, snapshot, viewer);
            toolsUsed.push(call.function.name);
          }
        } catch (error) {
          // Hand the failure back to the model so it can explain or recover,
          // rather than dropping the whole conversation.
          output = JSON.stringify({
            error: error instanceof Error ? error.message : "That lookup failed.",
          });
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: output,
        });
      }
    }

    return NextResponse.json({
      answer:
        "I looked in a few places but couldn't pull that together. Try asking about one thing at a time.",
      toolsUsed,
      proposals,
    });
  } catch (error) {
    if (error instanceof AiUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[ai]", error);
    return NextResponse.json(
      { error: "Something went wrong reaching the AI Planner." },
      { status: 500 },
    );
  }
}
