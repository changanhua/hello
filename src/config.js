import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filePath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator <= 0) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) process.env[key] = value;
  }
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function readConfig() {
  loadDotEnv();

  return {
    apiKey: process.env.DEEPSEEK_API_KEY?.trim() ?? "",
    baseUrl: (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com").replace(/\/+$/u, ""),
    model: process.env.DEEPSEEK_MODEL?.trim() || "deepseek-v4-flash",
    port: positiveInteger(process.env.PORT, 4173),
    timeoutMs: positiveInteger(process.env.MODEL_TIMEOUT_MS, 30_000),
    maxDraftChars: positiveInteger(process.env.MAX_DRAFT_CHARS, 12_000),
    maxContextChars: positiveInteger(process.env.MAX_CONTEXT_CHARS, 8_000)
  };
}
