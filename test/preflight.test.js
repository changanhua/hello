import test from "node:test";
import assert from "node:assert/strict";
import { buildDeepSeekRequest } from "../src/deepseek-client.js";
import { normalizeAssessment, validateInput } from "../src/schema.js";

const limits = { maxDraftChars: 100, maxContextChars: 50 };

test("DeepSeek request explicitly disables thinking mode", () => {
  const request = buildDeepSeekRequest(
    { draft: "测试", context: "", targetMode: "chat" },
    "deepseek-v4-flash"
  );

  assert.equal(request.model, "deepseek-v4-flash");
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.stream, false);
});

test("input validation trims content and preserves target mode", () => {
  const result = validateInput(
    { draft: "  做一个 MVP  ", context: "  只设计  ", targetMode: "agent" },
    limits
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.value, {
    draft: "做一个 MVP",
    context: "只设计",
    targetMode: "agent"
  });
});

test("input validation rejects oversized drafts", () => {
  const result = validateInput({ draft: "x".repeat(101) }, limits);
  assert.equal(result.ok, false);
  assert.match(result.error, /100/u);
});

test("normalizer clamps scores and forces original text for send_as_is", () => {
  const assessment = normalizeAssessment(
    {
      decision: "send_as_is",
      intentMode: "explore",
      domain: "general",
      understanding: "表达已足够。",
      readiness: {
        overall: 140,
        dimensions: { goalClarity: -3 }
      },
      optimizedText: "模型擅自改写",
      preservationChecks: {
        numbersPreserved: true,
        negationsPreserved: true,
        scopeNotExpanded: true,
        permissionsNotExpanded: true
      }
    },
    "原文"
  );

  assert.equal(assessment.readiness.overall, 100);
  assert.equal(assessment.readiness.dimensions.goalClarity, 0);
  assert.equal(assessment.optimizedText, "原文");
});

test("normalizer does not keep suggest_patch when text did not change", () => {
  const assessment = normalizeAssessment(
    {
      decision: "suggest_patch",
      optimizedText: "原文",
      readiness: { overall: 80, dimensions: {} }
    },
    "原文"
  );

  assert.equal(assessment.decision, "send_as_is");
});
