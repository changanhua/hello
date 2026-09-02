import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "../src/server.js";

async function withServer(options, run) {
  const server = createServer(options);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

const config = {
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash",
  port: 0,
  timeoutMs: 1000,
  maxDraftChars: 12000,
  maxContextChars: 8000
};

test("health endpoint reports non-thinking configuration", async () => {
  await withServer({ config }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.model, "deepseek-v4-flash");
    assert.equal(body.thinking, "disabled");
    assert.equal(body.configured, true);
  });
});

test("preflight endpoint returns normalized model output", async () => {
  const fakeFetch = async (_url, request) => {
    const upstreamBody = JSON.parse(request.body);
    assert.deepEqual(upstreamBody.thinking, { type: "disabled" });
    return new Response(
      JSON.stringify({
        model: "deepseek-v4-flash",
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: "suggest_patch",
                intentMode: "execute",
                domain: "agent_task",
                understanding: "用户希望做一个输入预检 MVP。",
                readiness: {
                  overall: 72,
                  dimensions: {
                    goalClarity: 80,
                    contextSufficiency: 60,
                    scopeClarity: 70,
                    constraintConsistency: 90,
                    deliverableClarity: 70,
                    verifiability: 55,
                    toolExecutability: 75
                  }
                },
                issues: [],
                blockingQuestion: null,
                assumptions: { explicit: [], contextual: [], proposed: [] },
                optimizedText: "做一个输入预检 MVP，并保留原文。",
                preservationChecks: {
                  numbersPreserved: true,
                  negationsPreserved: true,
                  scopeNotExpanded: true,
                  permissionsNotExpanded: true
                },
                noChangeReason: null
              })
            }
          }
        ],
        usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180 }
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  await withServer({ config, fetchImpl: fakeFetch }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/preflight`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft: "做个 MVP", targetMode: "agent" })
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.assessment.readiness.overall, 72);
    assert.equal(body.meta.thinking, "disabled");
    assert.equal(body.meta.usage.totalTokens, 180);
  });
});
