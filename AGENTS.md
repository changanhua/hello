# AGENTS.md

## Product invariant

This project evaluates whether a draft is ready for its intended downstream action. It is not a generic prompt beautifier.

## Hard safety boundaries

- Never execute the draft being analyzed.
- Never silently replace the original draft.
- Never add permissions or side effects that the user did not authorize.
- Keep DeepSeek thinking mode explicitly disabled in every model request.
- Keep `DEEPSEEK_API_KEY` server-side.
- Any model-generated field must pass deterministic normalization before reaching the UI.

## MVP scope

The MVP is deliberately stateless and dependency-free. Do not add accounts, persistence, vector search, autonomous tool use, or DSH production wiring without a separate design decision.

## Verification

Run:

```bash
npm run check
```
