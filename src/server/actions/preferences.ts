"use server";

import { z } from "zod";

import { CURRENCY_CODES } from "@/lib/money";
import { db } from "@/server/db";
import { revalidateWedding, withAction } from "./shared";

/**
 * Each person reads the wedding in their own currency — the Mehans in SGD, the
 * Chowdhrys in GBP. This only changes how figures are *displayed*; every stored
 * amount keeps the currency it was entered in.
 */
export async function setDisplayCurrency(currency: string) {
  return withAction("documents.view", async (viewer) => {
    const code = z.enum(CURRENCY_CODES as [string, ...string[]]).parse(currency);
    await db.user.update({
      where: { id: viewer.userId },
      data: { displayCurrency: code },
    });
    revalidateWedding();
    return { currency: code };
  });
}
