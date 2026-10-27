# AJ NEURAL INTERFACE OS | v19.5

## Sovereign Augmented Reality Intelligence

![AJ OS](https://img.shields.io/badge/OS-NEURAL-00f2ff?style=for-the-badge&logo=hologram)
![STABILITY](https://img.shields.io/badge/STABILITY-100%25-green?style=for-the-badge)
![CORE-SOVEREIGN](https://img.shields.io/badge/CORE-SOVEREIGN-blue?style=for-the-badge)

## ━━━━━━━━━━━━━━━━━━━━━━━

## 🧬 SYSTEM OVERVIEW

AJ is an elite, autonomous AR assistant engineered for the BOSS. Unlike standard AI, AJ operates on a **Sovereign Logic Core**, prioritizing local pattern matching and background intelligence scans over 3rd-party API reliance.

## 🚀 CORE CAPABILITIES

- **Conversational Matrix**: 100+ hard-coded context patterns with 10x randomized human-like responses.
- **Dynamic Intelligence**: Real-time grid search integration for any general knowledge query.
- **Neural Vault**: Persistent, encrypted mission logging to a private Supabase architecture.
- **Jarvis-Style HUD**: High-fidelity AR interface with holographic rendering and real-time voice synthesis.
- **Direct Navigation**: Instant redirection to global gateways (Spotify, YouTube, GitHub, etc.) via voice command.

## 🧠 AI ROUTING (NEW)

`api/chat.js` now does this on every unmatched query (i.e. anything not
already answered by the local `logicLibrary`):

1. **Try local Ollama first** — in local/dev runs it targets your Ollama
   server at `http://127.0.0.1:11434/api/chat` by default, and production
   only uses Ollama when `OLLAMA_BASE_URL` is configured.
2. **Classify intent** (`api/lib/router.js`) — keyword-based: coding,
   reasoning, math, research, writing, translation, summarization, or chat.
3. **Pick free OpenRouter models for that intent** — it fetches OpenRouter's
   live model list, filters to $0-cost models, and ranks them by how well
   their name/id matches the intent (e.g. "coder" models for coding,
   "r1"/"reasoning" models for math/reasoning, larger context windows for
   research/summarization). Model list is cached 10 minutes per server
   instance to avoid re-fetching every request.
4. **Try up to 4 candidates in order.** First one that responds wins.
5. **Falls back to Gemini** if Ollama is unreachable, `OPENROUTER_API_KEY`
   isn't set, or every OpenRouter candidate fails.
6. **Short-term memory** — the client keeps the last 12 turns
   (`AJ_AI.memory`) and sends them along so responses have conversational
   context, without shipping unbounded history.

**Known limitations, stated plainly:**
- Intent classification is keyword-based, not a trained model — it's cheap
  and fast, and gets the obvious cases right, but won't be perfect on
  ambiguous phrasing.
- There's no real RAG/embeddings layer yet. The "database" files
  (`database.json`, `master_database.json`) are canned prompt→response maps
  already handled by `logicLibrary` client-side — that's why local answers
  already take priority over any API call, with zero extra work needed.
- The UI is still the single-turn Jarvis HUD (terminal + answer box), not a
  ChatGPT-style multi-bubble chat thread. That's a separate, larger redesign
  if you want it — say the word and we'll scope it properly instead of
  bolting it on.

## 🛠️ TECHNICAL ARCHITECTURE

- **Engine**: [core_v19_5.js](core_v19_5.js) (Pure Logic & Neural Handshake)
- **Interface**: [index.html](index.html) (Holographic HUD & WebGL Particles)
- **AI Proxy**: [api/chat.js](api/chat.js) (Vercel serverless function — keeps the Gemini key server-side)
- **Database**: Supabase REST Sync (Confidential Persistence)
- **Deployment**: Vercel Edge Runtime [vercel.json](vercel.json)

## ⚠️ SECURITY NOTICE (READ BEFORE DEPLOYING)

An earlier version of this repo had the Gemini API key hardcoded directly in
`core_v19_5.js`, visible to anyone who opened the browser dev tools. That key
should be treated as compromised:

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) and
   **revoke/delete that key**, then generate a new one.
2. If this repo was ever pushed to a public GitHub remote, the old key is
   still in your git history even after this fix — remove it with
   [git-filter-repo](https://github.com/newren/git-filter-repo) or the
   [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/), or simplest:
   nuke `.git` history and re-init if the repo has no other history worth keeping.
3. Never put the new key in `core_v19_5.js` or any file under version control.
   It only ever goes in the `GEMINI_API_KEY` environment variable (see below).

## 🔧 SETUP: THE AI PROXY

The client (`core_v19_5.js`) no longer talks to Gemini directly. It calls
`/api/chat`, a Vercel serverless function that holds the key server-side.

**Local dev:**
```bash
cp .env.example .env
# edit .env and paste your keys
npm i -g vercel   # if you don't have the CLI
vercel dev
```

If you want local Ollama responses, start the Ollama server separately and
ensure the selected model is pulled first:
```bash
ollama serve
ollama pull llama3.1
```

**Production (Vercel dashboard):**
Project → Settings → Environment Variables → add `GEMINI_API_KEY` with your
new key → redeploy.

## ⚡ QUICK COMMANDS

- `AJ, play [Song] on Spotify` — Initializes high-fidelity audio stream.
- `AJ, direct me to GitHub` — Opens direct secure link.
- `AJ, status report` — Returns core stability and thermal levels.
- `AJ, who made you?` — Returns creator credentials.

## 🏁 FINAL PROTOCOL

### © 2026 AJ INDUSTRIES | SOVEREIGN INTELLIGENCE PROMPT

