# DSH Input Preflight MVP

A small, context-aware input preflight for DeepSeek Harness experiments.

It asks one practical question:

> Is this draft ready for the user's intended next step, and what is the smallest safe improvement?

This is **not** a prompt beautifier and it does not reward longer text. It preserves the original draft, diagnoses concrete execution gaps, proposes a minimal revision, and displays a word-level diff.

## What is included

- Natural-language draft input
- Chat-model vs tool-agent target modes
- Optional compact context
- Intent and domain classification
- Execution-readiness dimensions
- Blocker / warning / suggestion diagnostics
- Original vs optimized text and word-level diff
- Explicit / contextual / proposed assumption layers
- Deterministic normalization of model output
- Permission and semantic-preservation checks
- Server-side API key handling
- No runtime dependencies

## Model contract

The server calls the official OpenAI-compatible DeepSeek endpoint with:

```json
{
  "model": "deepseek-v4-flash",
  "thinking": { "type": "disabled" },
  "response_format": { "type": "json_object" },
  "temperature": 0.15,
  "stream": false
}
```

Thinking mode is disabled explicitly because DeepSeek V4 defaults to thinking mode. The browser never receives the API key.

Official references:

- https://api-docs.deepseek.com/api/create-chat-completion/
- https://api-docs.deepseek.com/guides/thinking_mode/
- https://api-docs.deepseek.com/guides/json_mode/

## Run locally

Requires Node.js 20 or newer.

```powershell
Copy-Item .env.example .env
# Edit .env and set DEEPSEEK_API_KEY
npm start
```

Then open:

```text
http://127.0.0.1:4173
```

No `npm install` is required because the MVP uses only Node.js built-ins.

## Test

```bash
npm run check
```

The tests assert, among other things, that every request explicitly contains:

```json
"thinking": { "type": "disabled" }
```

## Architecture

```text
Browser composer
    │
    ▼
POST /api/preflight
    │
    ├── input validation and size limits
    ├── fixed diagnostic system contract
    ├── DeepSeek V4 Flash / non-thinking / JSON mode
    └── deterministic result normalization
            │
            ▼
Understanding + readiness + issues + minimal rewrite + diff
```

The browser is presentation-only. The model call and API key stay on the server. The model has no tools and cannot execute the analyzed draft.

## DSH integration path

The standalone MVP is intentionally shaped so the core can later become a DSH capability:

```text
input-preflight.assess
```

The first integration should pass a compact context envelope containing the target agent, selected resources, available capabilities, and current permissions. It should not pass the entire conversation by default.

Recommended DSH behavior:

1. Keep invocation manual at first.
2. Show status inline under the composer.
3. Preserve the original draft and display a diff.
4. Never auto-send or silently replace text.
5. Treat the assessment as advisory, not authorization.
6. Log adoption and downstream task outcomes for evaluation.

## Deliberate limitations

- No persistence or user accounts
- No real DSH runtime integration yet
- No tool calls or autonomous execution
- No second model as an independent semantic verifier
- No personalized rules learned from user behavior
- No claim that the readiness score is calibrated yet

The next valuable step is not more UI. It is collecting real draft → assessment → adopted revision → downstream outcome pairs and measuring whether the preflight improves task success without raising distortion or interruption rates.
