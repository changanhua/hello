const DECISIONS = new Set(["send_as_is", "suggest_patch", "ask_question"]);
const INTENTS = new Set(["explore", "decide", "execute", "review", "explain", "create", "converse"]);
const DOMAINS = new Set(["coding", "research", "writing", "planning", "agent_task", "general"]);
const SEVERITIES = new Set(["blocker", "warning", "suggestion"]);

const DIMENSION_KEYS = [
  "goalClarity",
  "contextSufficiency",
  "scopeClarity",
  "constraintConsistency",
  "deliverableClarity",
  "verifiability",
  "toolExecutability"
];

function stringValue(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function nullableString(value) {
  const normalized = stringValue(value);
  return normalized || null;
}

function enumValue(value, allowed, fallback) {
  return typeof value === "string" && allowed.has(value) ? value : fallback;
}

function score(value, fallback = 50) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(Math.min(100, Math.max(0, number)));
}

function stringArray(value, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function booleanValue(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeAssessment(raw, originalDraft) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Model output is not a JSON object.");
  }

  const rawDimensions = raw.readiness?.dimensions ?? {};
  const dimensions = Object.fromEntries(
    DIMENSION_KEYS.map((key) => [key, score(rawDimensions[key])])
  );

  const issues = Array.isArray(raw.issues)
    ? raw.issues
        .filter((issue) => issue && typeof issue === "object" && !Array.isArray(issue))
        .map((issue) => ({
          severity: enumValue(issue.severity, SEVERITIES, "warning"),
          code: stringValue(issue.code, "UNSPECIFIED_ISSUE").toUpperCase().replace(/[^A-Z0-9_]/gu, "_"),
          evidence: stringValue(issue.evidence),
          reason: stringValue(issue.reason, "The model did not provide a reason."),
          suggestedFix: stringValue(issue.suggestedFix)
        }))
        .slice(0, 10)
    : [];

  let decision = enumValue(raw.decision, DECISIONS, issues.length ? "suggest_patch" : "send_as_is");
  let optimizedText = stringValue(raw.optimizedText, originalDraft);
  if (!optimizedText) optimizedText = originalDraft;

  if (decision === "send_as_is") optimizedText = originalDraft;
  if (optimizedText === originalDraft && decision === "suggest_patch") decision = "send_as_is";

  return {
    decision,
    intentMode: enumValue(raw.intentMode, INTENTS, "converse"),
    domain: enumValue(raw.domain, DOMAINS, "general"),
    understanding: stringValue(raw.understanding, "未能生成可靠的意图摘要。"),
    readiness: {
      overall: score(raw.readiness?.overall),
      dimensions
    },
    issues,
    blockingQuestion: nullableString(raw.blockingQuestion),
    assumptions: {
      explicit: stringArray(raw.assumptions?.explicit),
      contextual: stringArray(raw.assumptions?.contextual),
      proposed: stringArray(raw.assumptions?.proposed)
    },
    optimizedText,
    preservationChecks: {
      numbersPreserved: booleanValue(raw.preservationChecks?.numbersPreserved),
      negationsPreserved: booleanValue(raw.preservationChecks?.negationsPreserved),
      scopeNotExpanded: booleanValue(raw.preservationChecks?.scopeNotExpanded),
      permissionsNotExpanded: booleanValue(raw.preservationChecks?.permissionsNotExpanded)
    },
    noChangeReason: nullableString(raw.noChangeReason)
  };
}

export function validateInput(body, limits) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const draft = typeof body.draft === "string" ? body.draft.trim() : "";
  const context = typeof body.context === "string" ? body.context.trim() : "";
  const targetMode = body.targetMode === "agent" ? "agent" : "chat";

  if (!draft) return { ok: false, error: "请输入需要检测的文本。" };
  if (draft.length > limits.maxDraftChars) {
    return { ok: false, error: `输入不能超过 ${limits.maxDraftChars} 个字符。` };
  }
  if (context.length > limits.maxContextChars) {
    return { ok: false, error: `补充上下文不能超过 ${limits.maxContextChars} 个字符。` };
  }

  return { ok: true, value: { draft, context, targetMode } };
}
