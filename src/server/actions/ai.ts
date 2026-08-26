"use server";

import { z } from "zod";

import { executeProposal, rejectProposal } from "@/server/ai/proposals";
import { revalidateWedding, withAction } from "./shared";

/** Approve an AI suggestion. Executes through the normal mutation path. */
export async function approveAiProposal(proposalId: string) {
  return withAction("ai.use", async (viewer) => {
    const id = z.string().min(1).parse(proposalId);
    const result = await executeProposal(id, viewer);
    if (!result.ok) throw new Error(result.error ?? "That change couldn't be applied.");
    revalidateWedding();
    return { applied: true };
  });
}

export async function dismissAiProposal(proposalId: string) {
  return withAction("ai.use", async (viewer) => {
    const id = z.string().min(1).parse(proposalId);
    await rejectProposal(id, viewer);
    revalidateWedding();
    return { dismissed: true };
  });
}
