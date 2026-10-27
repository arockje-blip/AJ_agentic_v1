// api/chat.js
// Server-side proxy for the AJ core. This is the ONLY place any API key is
// ever read (GEMINI_API_KEY, OPENROUTER_API_KEY) — they live in Vercel
// environment variables and are never sent to, or visible from, the browser.
// Ollama is supported as a local-first backend via OLLAMA_BASE_URL and
// OLLAMA_MODEL, defaulting to http://127.0.0.1:11434 when enabled.
//
// Flow: classify intent -> pick best free OpenRouter model(s) for that
// intent -> try them in order -> if OpenRouter isn't configured or every
// candidate fails, fall back to Gemini -> return only the final text.

const { classifyIntent, selectModelsForIntent } = require("./lib/router.js");

const GEMINI_MODEL = "gemini-1.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OLLAMA_ENABLED = Boolean(process.env.OLLAMA_BASE_URL) || process.env.NODE_ENV !== "production";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1";
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/$/, "");

// Lightweight in-memory rate limiter. Serverless instances are short-lived,
// so this is a soft speed bump against loops/abuse, not a hard guarantee.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const requestLog = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}

const SYSTEM_PROMPT =
  "You are AJ, an elite AR Assistant. Be brief. Token conservation is priority. No fillers.";

// Trim history to the last N turns so we don't burn tokens on ancient
// context. Real "compress with a summary" memory is a bigger future step;
// this is the honest, working version for now.
function buildMessages(input, history, context) {
  const trimmed = Array.isArray(history) ? history.slice(-8) : [];
  const sys = context ? `${SYSTEM_PROMPT}\nReference notes (use only if relevant):\n${context}` : SYSTEM_PROMPT;
  const messages = [{ role: "system", content: sys }];
  for (const turn of trimmed) {
    if (!turn || typeof turn.content !== "string") continue;
    const role = turn.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: turn.content.slice(0, 2000) });
  }
  messages.push({ role: "user", content: input });
  return messages;
}

async function tryOpenRouter(input, history, intent, context) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null; // not configured, skip straight to Gemini

  let candidates = [];
  try {
    candidates = await selectModelsForIntent(apiKey, intent);
  } catch (e) {
    console.error("[api/chat] OpenRouter model list error:", e.message);
    return null;
  }
  if (candidates.length === 0) return null;

  const messages = buildMessages(input, history, context);

  for (const model of candidates) {
    try {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://aj-neural-interface.vercel.app",
          "X-Title": "AJ Neural Interface",
        },
        body: JSON.stringify({ model, messages, max_tokens: 600 }),
      });

      if (!res.ok) {
        console.error(`[api/chat] OpenRouter model ${model} failed: ${res.status}`);
        continue; // try next candidate
      }

      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (text) return { text, model, provider: "openrouter" };
    } catch (e) {
      console.error(`[api/chat] OpenRouter model ${model} error:`, e.message);
      continue;
    }
  }
  return null; // every candidate failed
}

async function tryOllama(input, history, context) {
  if (!OLLAMA_ENABLED) return null;

  const messages = buildMessages(input, history, context);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: false,
      }),
    });

    if (!res.ok) {
      console.error(`[api/chat] Ollama model ${OLLAMA_MODEL} failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const text = data?.message?.content || data?.response;
    if (text) return { text, model: OLLAMA_MODEL, provider: "ollama" };
    return null;
  } catch (e) {
    console.error("[api/chat] Ollama proxy error:", e.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryGemini(input, history, context) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  // Gemini's API doesn't take OpenAI-style role arrays the same way; fold
  // recent history into the prompt text plainly.
  const trimmed = Array.isArray(history) ? history.slice(-8) : [];
  const historyText = trimmed
    .map((t) => `${t.role === "assistant" ? "AJ" : "User"}: ${t.content}`)
    .join("\n");

  const prompt = `System: ${SYSTEM_PROMPT}${context ? "\nReference notes: " + context : ""}\n${historyText ? historyText + "\n" : ""}User: ${input}`;

  try {
    const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) {
      console.error("[api/chat] Gemini upstream error:", res.status);
      return null;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) return { text, model: GEMINI_MODEL, provider: "gemini" };
    return null;
  } catch (e) {
    console.error("[api/chat] Gemini proxy error:", e.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (isRateLimited(ip)) {
    res.status(429).json({ error: "Too many requests. Slow down." });
    return;
  }

  let input = "";
  let history = [];
  let context = "";
  try {
    input = (req.body && req.body.input) || "";
    history = (req.body && req.body.history) || [];
    context = typeof (req.body && req.body.context) === "string" ? req.body.context.slice(0, 1500) : "";
  } catch (e) {
    res.status(400).json({ error: "Invalid request body." });
    return;
  }

  if (!input || typeof input !== "string" || input.length > 4000) {
    res.status(400).json({ error: "Invalid input." });
    return;
  }

  const intent = classifyIntent(input);

  let result = await tryOllama(input, history, context);
  if (!result) result = await tryOpenRouter(input, history, intent, context);
  if (!result) result = await tryGemini(input, history, context);

  if (!result) {
    console.error("[api/chat] All providers failed or unconfigured.");
    res.status(502).json({ error: "AI backend is temporarily unavailable." });
    return;
  }

  res.status(200).json({ text: result.text, intent, provider: result.provider, model: result.model });
};
