import "server-only";

/**
 * Qwen client.
 *
 * Talks to DashScope's OpenAI-compatible endpoint. The key is read from the
 * environment on the server and never reaches the browser — the only route to
 * the model is through our own API, which applies the viewer's permissions
 * first.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatResult {
  content: string;
  toolCalls: ToolCall[];
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.QWEN_API_KEY);
}

const DEFAULT_BASE = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export async function chat(
  messages: ChatMessage[],
  tools?: ToolDefinition[],
  options: { temperature?: number; signal?: AbortSignal } = {},
): Promise<ChatResult> {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError(
      "The AI Planner isn't configured — no QWEN_API_KEY is set.",
    );
  }

  const baseUrl = (process.env.QWEN_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.QWEN_MODEL || "qwen-plus";

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        ...(tools?.length ? { tools, tool_choice: "auto" } : {}),
        // Low: this assistant reports figures, it doesn't write prose. Higher
        // temperatures were observed substituting one number for another.
        temperature: options.temperature ?? 0.1,
      }),
      signal: options.signal ?? AbortSignal.timeout(60_000),
    });
  } catch (error) {
    if ((error as Error).name === "TimeoutError") {
      throw new AiUnavailableError("The AI Planner took too long to respond.");
    }
    throw new AiUnavailableError(
      "Couldn't reach the AI Planner. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    // Surface the real reason — a wrong key or an exhausted quota should say so
    // rather than looking like a generic failure.
    if (response.status === 401 || response.status === 403) {
      throw new AiUnavailableError(
        "The AI Planner's API key was rejected. Check QWEN_API_KEY.",
      );
    }
    if (response.status === 429) {
      throw new AiUnavailableError(
        "The AI Planner is rate-limited right now. Try again shortly.",
      );
    }
    throw new AiUnavailableError(
      `The AI Planner returned an error (${response.status}). ${body.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string; tool_calls?: ToolCall[] } }[];
  };

  const message = payload.choices?.[0]?.message;
  return {
    content: message?.content ?? "",
    toolCalls: message?.tool_calls ?? [],
  };
}
