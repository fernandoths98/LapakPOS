import Anthropic from "@anthropic-ai/sdk";
import { aiEnabled, env } from "../../config/env";

/**
 * Thrown immediately, before any network call, whenever `aiEnabled` is
 * false (no `ANTHROPIC_API_KEY` configured). Callers in recap.service.ts
 * catch this specifically and fall back to the deterministic, non-AI
 * summary — it must never bubble up as a raw 500.
 */
export class AiUnavailableError extends Error {
  constructor(message = "AI recap is unavailable: ANTHROPIC_API_KEY is not configured on the backend") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Model id per this phase's spec — the current Claude Sonnet 5. */
export const RECAP_MODEL = "claude-sonnet-5";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * A minimal JSON-schema-ish shape sufficient for describing the tool input
 * we want Claude to produce — enough for `Tool.InputSchema` (`{type:
 * "object", properties, ...}`) without dragging in a full JSON Schema
 * validator dependency for this. Nested values are typed loosely since
 * they're only ever handed straight through to the API as `input_schema`.
 */
export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface GenerateStructuredArgs {
  system: string;
  /**
   * Convenience form for the common single-turn case: a single user-turn
   * string. Provide this OR `messages`, never both — see `messages` below.
   */
  user?: string;
  /**
   * Full ordered list of turns to send instead of `user` — needed for (a)
   * multi-turn chat (Ask tab: prior turns + the new question) and (b)
   * non-text content, like a vision image block (product photo-fill).
   * Provide this OR `user`, never both.
   */
  messages?: Anthropic.MessageParam[];
  /** JSON schema the response must conform to. */
  jsonSchema: JsonSchema;
  /** Tool name used internally for the forced-tool-use call; purely diagnostic, never seen by the merchant. */
  toolName?: string;
  maxTokens?: number;
}

/**
 * Calls the Anthropic Messages API and forces a reliable JSON shape back.
 *
 * The installed `@anthropic-ai/sdk` is 0.32.1 (see `node_modules/@anthropic-ai/sdk/package.json`),
 * which predates the `output_config: { format: { type: "json_schema", ... } }`
 * structured-outputs mechanism — grepping `resources/messages.d.ts` in that
 * package turns up no `output_config`/`OutputConfig`/`json_schema` field at
 * all. What this SDK version *does* support, and what this function uses
 * instead, is the classic "forced tool use" pattern: define a single tool
 * whose `input_schema` is the shape we want, then set
 * `tool_choice: { type: "tool", name }` so Claude MUST reply with a
 * `tool_use` block matching that schema rather than free text. This is a
 * fully-supported, documented mechanism on this SDK version (see
 * `Tool`, `ToolChoiceTool` in `resources/messages.d.ts`) and gives the same
 * reliability guarantee structured outputs would.
 *
 * Throws `AiUnavailableError` synchronously (before any network call) when
 * `!aiEnabled`. Any other failure (network, 4xx/5xx, malformed tool input)
 * propagates as a normal thrown error — callers decide how to degrade.
 */
export async function generateStructured<T>({
  system,
  user,
  messages,
  jsonSchema,
  toolName = "emit_recap",
  maxTokens = 1536,
}: GenerateStructuredArgs): Promise<T> {
  if (!aiEnabled) {
    throw new AiUnavailableError();
  }
  if ((user === undefined) === (messages === undefined)) {
    throw new Error("generateStructured requires exactly one of `user` or `messages`");
  }
  const resolvedMessages: Anthropic.MessageParam[] = messages ?? [{ role: "user", content: user as string }];

  const response = await getClient().messages.create({
    model: RECAP_MODEL,
    max_tokens: maxTokens,
    system,
    messages: resolvedMessages,
    tools: [
      {
        name: toolName,
        description: "Emit the structured recap result. Always call this tool exactly once with the final answer.",
        input_schema: jsonSchema,
      },
    ],
    tool_choice: { type: "tool", name: toolName },
  });

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === toolName,
  );
  if (!toolUse) {
    throw new Error(`Claude response did not include the expected "${toolName}" tool call`);
  }

  return toolUse.input as T;
}
