// api/lib/router.js
// Heuristic intent classification + OpenRouter free-model selection.
//
// NOTE ON HONESTY: this is keyword-based classification, not a trained
// classifier. It's fast, has zero cost/latency, and is "good enough" to pick
// a sensible model family. A real ML classifier is a separate, bigger piece
// of work if you want it later.

const INTENT_KEYWORDS = {
  coding: [
    "code", "function", "bug", "debug", "error", "compile", "javascript",
    "python", "css", "html", "api", "script", "algorithm", "regex", "sql",
    "refactor", "stack trace", "exception", "syntax", "class ", "variable",
  ],
  reasoning: [
    "why", "explain", "prove", "logic", "reason", "analyze", "compare",
    "pros and cons", "evaluate", "strategy", "plan",
  ],
  math: [
    "calculate", "solve", "equation", "math", "algebra", "integral",
    "derivative", "probability", "statistics", "sum of", "how many",
  ],
  research: [
    "research", "summarize this", "long document", "compare sources",
    "literature", "history of", "explain in depth", "deep dive",
  ],
  writing: [
    "write", "draft", "essay", "poem", "story", "email", "letter",
    "rewrite", "paraphrase", "tone",
  ],
  translation: ["translate", "translation", "in tamil", "in spanish", "in french"],
  summarization: ["summarize", "tl;dr", "shorten", "condense", "summary"],
};

function classifyIntent(text) {
  const t = (text || "").toLowerCase();
  let best = "chat";
  let bestScore = 0;
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const score = keywords.reduce((acc, kw) => (t.includes(kw) ? acc + 1 : acc), 0);
    if (score > bestScore) {
      bestScore = score;
      best = intent;
    }
  }
  return best;
}

// Which substrings in an OpenRouter model id/name hint it's good at what.
// Used to rank the live free-model list per intent, instead of hardcoding
// specific model slugs that go stale.
const INTENT_ID_HINTS = {
  coding: ["coder", "code", "codestral", "starcoder"],
  reasoning: ["r1", "reasoning", "think", "o1", "qwq"],
  math: ["r1", "reasoning", "think", "math", "qwq"],
  research: [], // preference handled via context_length instead, below
  writing: ["instruct", "chat"],
  translation: ["instruct", "chat"],
  summarization: ["instruct", "chat", "flash", "mini", "small"],
  chat: ["instruct", "chat", "flash"],
};

let modelCache = { list: null, fetchedAt: 0 };
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function fetchFreeModels(apiKey) {
  const now = Date.now();
  if (modelCache.list && now - modelCache.fetchedAt < MODEL_CACHE_TTL_MS) {
    return modelCache.list;
  }

  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter model list failed: ${res.status}`);
  const data = await res.json();

  const free = (data.data || []).filter((m) => {
    const p = m.pricing || {};
    return (
      (p.prompt === "0" || p.prompt === 0) &&
      (p.completion === "0" || p.completion === 0)
    );
  });

  modelCache = { list: free, fetchedAt: now };
  return free;
}

// Returns an ordered list of candidate model IDs to try for a given intent,
// ranked by relevance, so the caller can fall through on failure.
async function selectModelsForIntent(apiKey, intent) {
  const free = await fetchFreeModels(apiKey);
  if (free.length === 0) return [];

  const hints = INTENT_ID_HINTS[intent] || INTENT_ID_HINTS.chat;

  const scored = free.map((m) => {
    const id = (m.id || "").toLowerCase();
    let score = 0;
    for (const hint of hints) if (id.includes(hint)) score += 2;
    // Prefer larger context windows for research/summarization specifically.
    if ((intent === "research" || intent === "summarization") && m.context_length) {
      score += Math.min(m.context_length / 32000, 3);
    }
    return { id: m.id, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 4).map((s) => s.id); // top 4 candidates to try in order
}

module.exports = { classifyIntent, selectModelsForIntent, fetchFreeModels };
