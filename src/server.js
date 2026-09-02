import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConfig } from "./config.js";
import { assessWithDeepSeek } from "./deepseek-client.js";
import { validateInput } from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Request body is too large.");
      error.code = "PAYLOAD_TOO_LARGE";
      throw error;
    }
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text || "{}");
  } catch {
    const error = new Error("Request body is not valid JSON.");
    error.code = "INVALID_JSON";
    throw error;
  }
}

function safePublicPath(urlPath) {
  const pathname = urlPath === "/" ? "/index.html" : urlPath;
  const resolved = path.resolve(PUBLIC_DIR, `.${pathname}`);
  return resolved.startsWith(`${PUBLIC_DIR}${path.sep}`) ? resolved : null;
}

async function serveStatic(request, response, url) {
  const filePath = safePublicPath(url.pathname);
  if (!filePath) {
    sendJson(response, 400, { error: { code: "INVALID_PATH", message: "Invalid path." } });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": filePath.endsWith("index.html") ? "no-cache" : "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    });
    response.end(content);
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Not found." } });
      return;
    }
    throw error;
  }
}

export function createServer({ config = readConfig(), fetchImpl = fetch } = {}) {
  return http.createServer(async (request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, {
          ok: true,
          configured: Boolean(config.apiKey),
          model: config.model,
          thinking: "disabled"
        });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/preflight") {
        const body = await readJsonBody(request);
        const validated = validateInput(body, config);
        if (!validated.ok) {
          sendJson(response, 400, {
            error: { code: "INVALID_INPUT", message: validated.error }
          });
          return;
        }

        const result = await assessWithDeepSeek(validated.value, config, fetchImpl);
        sendJson(response, 200, result);
        return;
      }

      if (request.method === "GET" || request.method === "HEAD") {
        await serveStatic(request, response, url);
        return;
      }

      sendJson(response, 405, {
        error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." }
      });
    } catch (error) {
      const code = error?.code || "INTERNAL_ERROR";
      const status =
        code === "CONFIG_ERROR"
          ? 503
          : code === "PAYLOAD_TOO_LARGE"
            ? 413
            : code === "INVALID_JSON"
              ? 400
              : code === "UPSTREAM_ERROR"
                ? 502
                : code === "TIMEOUT"
                  ? 504
                  : 500;

      console.error(`[${code}]`, error?.message || error);
      sendJson(response, status, {
        error: {
          code,
          message:
            code === "INTERNAL_ERROR"
              ? "Unexpected server error. Check the server log."
              : error.message
        }
      });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const config = readConfig();
  const server = createServer({ config });
  server.listen(config.port, "127.0.0.1", () => {
    console.log(`DSH Input Preflight: http://127.0.0.1:${config.port}`);
    console.log(`Model: ${config.model} · thinking disabled · API key: ${config.apiKey ? "configured" : "missing"}`);
  });
}
