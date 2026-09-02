import { buildUserMessage, SYSTEM_PROMPT } from "./prompt.js";
import { normalizeAssessment } from "./schema.js";

export function buildDeepSeekRequest(input, model = "deepseek-v4-flash") {
  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserMessage(input) }
    ],
    // DeepSeek V4 models default to thinking mode. This is intentionally explicit.
    thinking: { type: "disabled" },
    response_format: { type: "json_object" },
    temperature: 0.15,
    max_tokens: 2200,
    stream: false
  };
}

function extractJson(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("DeepSeek returned an empty response.");
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu)?.[1];
    if (fenced) return JSON.parse(fenced.trim());

    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1));
    throw new Error("DeepSeek did not return parseable JSON.");
  }
}

export async function assessWithDeepSeek(input, config, fetchImpl = fetch) {
  if (!config.apiKey) {
    const error = new Error("DEEPSEEK_API_KEY is not configured on the server.");
    error.code = "CONFIG_ERROR";
    throw error;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();

  try {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildDeepSeekRequest(input, config.model)),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const message = payload?.error?.message || `DeepSeek API returned HTTP ${response.status}.`;
      const error = new Error(message);
      error.code = "UPSTREAM_ERROR";
      error.status = response.status;
      throw error;
    }

    const content = payload?.choices?.[0]?.message?.content;
    const assessment = normalizeAssessment(extractJson(content), input.draft);

    return {
      assessment,
      meta: {
        model: payload?.model || config.model,
        thinking: "disabled",
        latencyMs: Date.now() - startedAt,
        usage: payload?.usage
          ? {
              promptTokens: payload.usage.prompt_tokens ?? null,
              completionTokens: payload.usage.completion_tokens ?? null,
              totalTokens: payload.usage.total_tokens ?? null
            }
          : null
      }
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(`DeepSeek request timed out after ${config.timeoutMs} ms.`);
      timeoutError.code = "TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
