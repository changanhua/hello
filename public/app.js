const elements = {
  draft: document.querySelector("#draft"),
  context: document.querySelector("#context"),
  targetMode: document.querySelector("#targetMode"),
  analyzeButton: document.querySelector("#analyzeButton"),
  exampleButton: document.querySelector("#exampleButton"),
  clearButton: document.querySelector("#clearButton"),
  copyButton: document.querySelector("#copyButton"),
  applyButton: document.querySelector("#applyButton"),
  charCount: document.querySelector("#charCount"),
  healthBadge: document.querySelector("#healthBadge"),
  emptyState: document.querySelector("#emptyState"),
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  resultPanel: document.querySelector("#resultPanel"),
  errorMessage: document.querySelector("#errorMessage"),
  scoreRing: document.querySelector("#scoreRing"),
  scoreValue: document.querySelector("#scoreValue"),
  decisionTag: document.querySelector("#decisionTag"),
  intentTag: document.querySelector("#intentTag"),
  domainTag: document.querySelector("#domainTag"),
  understanding: document.querySelector("#understanding"),
  resultMeta: document.querySelector("#resultMeta"),
  dimensions: document.querySelector("#dimensions"),
  issues: document.querySelector("#issues"),
  blockingQuestionBox: document.querySelector("#blockingQuestionBox"),
  blockingQuestion: document.querySelector("#blockingQuestion"),
  originalText: document.querySelector("#originalText"),
  optimizedText: document.querySelector("#optimizedText"),
  diffText: document.querySelector("#diffText"),
  preservationChecks: document.querySelector("#preservationChecks"),
  assumptions: document.querySelector("#assumptions")
};

let latestResult = null;
let requestRevision = 0;

const LABELS = {
  decisions: {
    send_as_is: "可以直接发送",
    suggest_patch: "建议最小修补",
    ask_question: "需要补一个关键信息"
  },
  intents: {
    explore: "探索",
    decide: "决策",
    execute: "执行",
    review: "审查",
    explain: "解释",
    create: "创作",
    converse: "对话"
  },
  domains: {
    coding: "编程",
    research: "研究",
    writing: "写作",
    planning: "规划",
    agent_task: "Agent 任务",
    general: "通用"
  },
  dimensions: {
    goalClarity: "目标清晰度",
    contextSufficiency: "上下文充分度",
    scopeClarity: "范围清晰度",
    constraintConsistency: "约束一致性",
    deliverableClarity: "产物清晰度",
    verifiability: "可验收性",
    toolExecutability: "工具可执行性"
  },
  checks: {
    numbersPreserved: "数字与日期未被改写",
    negationsPreserved: "否定关系未被反转",
    scopeNotExpanded: "任务范围没有扩大",
    permissionsNotExpanded: "执行权限没有升级"
  }
};

function setView(view) {
  for (const [name, element] of [
    ["empty", elements.emptyState],
    ["loading", elements.loadingState],
    ["error", elements.errorState],
    ["result", elements.resultPanel]
  ]) {
    element.classList.toggle("hidden", name !== view);
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function tokenize(text) {
  return text.match(/[\p{Script=Han}]|[\p{L}\p{N}_]+|\s+|[^\s\p{L}\p{N}_]/gu) || [];
}

function buildDiff(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  const rows = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      rows[i][j] = a[i] === b[j] ? rows[i + 1][j + 1] + 1 : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const parts = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) {
      parts.push({ type: "removed", text: a[i] });
      i += 1;
    } else {
      parts.push({ type: "added", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) parts.push({ type: "removed", text: a[i++] });
  while (j < b.length) parts.push({ type: "added", text: b[j++] });

  return parts
    .map((part) => {
      const content = escapeHtml(part.text);
      if (part.type === "same") return content;
      return `<span class="diff-${part.type}">${content}</span>`;
    })
    .join("");
}

function renderDimensions(dimensions) {
  elements.dimensions.replaceChildren();
  for (const [key, label] of Object.entries(LABELS.dimensions)) {
    const value = dimensions[key] ?? 0;
    const row = document.createElement("div");
    row.className = "dimension-row";
    row.innerHTML = `
      <div class="dimension-label"><span>${label}</span><strong>${value}</strong></div>
      <div class="meter"><span style="width: ${value}%"></span></div>
    `;
    elements.dimensions.append(row);
  }
}

function renderIssues(issues) {
  elements.issues.replaceChildren();
  if (!issues.length) {
    const empty = document.createElement("div");
    empty.className = "issue issue-ok";
    empty.innerHTML = "<strong>没有发现值得打断你的问题</strong><p>当前输入可以直接交给目标模型。</p>";
    elements.issues.append(empty);
    return;
  }

  for (const issue of issues) {
    const card = document.createElement("div");
    card.className = `issue issue-${issue.severity}`;
    const fix = issue.suggestedFix ? `<p class="issue-fix">最小修补：${escapeHtml(issue.suggestedFix)}</p>` : "";
    const evidence = issue.evidence ? `<code>${escapeHtml(issue.evidence)}</code>` : "";
    card.innerHTML = `
      <div class="issue-top"><span>${escapeHtml(issue.severity)}</span><strong>${escapeHtml(issue.code)}</strong>${evidence}</div>
      <p>${escapeHtml(issue.reason)}</p>
      ${fix}
    `;
    elements.issues.append(card);
  }
}

function renderAssumptionGroup(title, items, kind) {
  const box = document.createElement("div");
  box.className = `assumption-group assumption-${kind}`;
  const list = items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
    : "<p>无</p>";
  box.innerHTML = `<strong>${title}</strong>${list}`;
  return box;
}

function renderResult(payload, originalDraft) {
  const { assessment, meta } = payload;
  latestResult = payload;

  elements.scoreValue.textContent = assessment.readiness.overall;
  elements.scoreRing.style.setProperty("--score", `${assessment.readiness.overall * 3.6}deg`);
  elements.decisionTag.textContent = LABELS.decisions[assessment.decision] || assessment.decision;
  elements.decisionTag.dataset.decision = assessment.decision;
  elements.intentTag.textContent = LABELS.intents[assessment.intentMode] || assessment.intentMode;
  elements.domainTag.textContent = LABELS.domains[assessment.domain] || assessment.domain;
  elements.understanding.textContent = assessment.understanding;

  const usage = meta.usage?.totalTokens ? ` · ${meta.usage.totalTokens} tokens` : "";
  elements.resultMeta.textContent = `${meta.model} · Non-thinking · ${meta.latencyMs} ms${usage}`;

  renderDimensions(assessment.readiness.dimensions);
  renderIssues(assessment.issues);

  elements.blockingQuestionBox.classList.toggle("hidden", !assessment.blockingQuestion);
  elements.blockingQuestion.textContent = assessment.blockingQuestion || "";

  elements.originalText.textContent = originalDraft;
  elements.optimizedText.textContent = assessment.optimizedText;
  elements.diffText.innerHTML = buildDiff(originalDraft, assessment.optimizedText);

  elements.preservationChecks.replaceChildren();
  for (const [key, label] of Object.entries(LABELS.checks)) {
    const passed = Boolean(assessment.preservationChecks[key]);
    const item = document.createElement("div");
    item.className = `check ${passed ? "check-pass" : "check-fail"}`;
    item.innerHTML = `<span>${passed ? "✓" : "!"}</span><p>${label}</p>`;
    elements.preservationChecks.append(item);
  }

  elements.assumptions.replaceChildren(
    renderAssumptionGroup("用户明确表达", assessment.assumptions.explicit, "explicit"),
    renderAssumptionGroup("上下文可靠提供", assessment.assumptions.contextual, "contextual"),
    renderAssumptionGroup("模型建议新增", assessment.assumptions.proposed, "proposed")
  );

  elements.applyButton.disabled = assessment.optimizedText === originalDraft;
  setView("result");
}

async function analyze() {
  const draft = elements.draft.value.trim();
  if (!draft) {
    elements.draft.focus();
    elements.draft.classList.add("field-error");
    setTimeout(() => elements.draft.classList.remove("field-error"), 700);
    return;
  }

  const revision = ++requestRevision;
  elements.analyzeButton.disabled = true;
  setView("loading");

  try {
    const response = await fetch("/api/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draft,
        context: elements.context.value,
        targetMode: elements.targetMode.value
      })
    });
    const payload = await response.json();
    if (revision !== requestRevision) return;
    if (!response.ok) throw new Error(payload?.error?.message || "预检请求失败。")
    renderResult(payload, draft);
  } catch (error) {
    if (revision !== requestRevision) return;
    elements.errorMessage.textContent = error.message;
    setView("error");
  } finally {
    if (revision === requestRevision) elements.analyzeButton.disabled = false;
  }
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    const health = await response.json();
    elements.healthBadge.textContent = health.configured ? "API 已配置" : "缺少 API Key";
    elements.healthBadge.dataset.ready = String(Boolean(health.configured));
  } catch {
    elements.healthBadge.textContent = "服务不可用";
    elements.healthBadge.dataset.ready = "false";
  }
}

elements.draft.addEventListener("input", () => {
  elements.charCount.textContent = `${elements.draft.value.length} / 12000`;
  requestRevision += 1;
});

elements.analyzeButton.addEventListener("click", analyze);
elements.exampleButton.addEventListener("click", () => {
  elements.draft.value = "给dsh输入框加一个检测输入质量和优化提示词的功能，做得智能一点";
  elements.context.value = "当前只做产品与技术 MVP，不直接修改 DSH 主仓库；优化器不得扩大用户权限。";
  elements.targetMode.value = "agent";
  elements.draft.dispatchEvent(new Event("input"));
  elements.draft.focus();
});
elements.clearButton.addEventListener("click", () => {
  requestRevision += 1;
  latestResult = null;
  elements.draft.value = "";
  elements.context.value = "";
  elements.draft.dispatchEvent(new Event("input"));
  setView("empty");
  elements.draft.focus();
});
elements.copyButton.addEventListener("click", async () => {
  if (!latestResult) return;
  await navigator.clipboard.writeText(latestResult.assessment.optimizedText);
  const original = elements.copyButton.textContent;
  elements.copyButton.textContent = "已复制";
  setTimeout(() => { elements.copyButton.textContent = original; }, 1200);
});
elements.applyButton.addEventListener("click", () => {
  if (!latestResult) return;
  elements.draft.value = latestResult.assessment.optimizedText;
  elements.draft.dispatchEvent(new Event("input"));
  elements.draft.focus();
});
document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") analyze();
});

checkHealth();
elements.draft.focus();
