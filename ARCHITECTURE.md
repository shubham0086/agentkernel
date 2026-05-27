# 🏛️ Architectural Deep Dive

This document details the advanced design patterns implemented inside **Equilibrium**. These patterns represent production-hardened engineering strategies designed to make AI systems resilient, highly self-healing, and cost-effective.

---

## 🛡️ 1. SCAR: Repeat Failure Guard
The **Sovereign Critical Action Record (SCAR)** engine prevents agents from entering recursive loops or repeating identical execution failures.

```
+------------------+     Logged      +-------------------+
|  Agent Executor  | --------------> | SQLite IncidentDB |
+------------------+                 +-------------------+
         ^                                     |
         |  Warns/Blocks                       | Reads Past Matches
         |  (Top-of-prompt inject)             v
+--------------------------------------------------------+
|           SCAR Repeat Failure Detector                 |
|      (If regex matches pattern >= 2 times)             |
+--------------------------------------------------------+
```

### Pattern Mechanics
1. **Incident Logging**: When a task step errors, the agent records the incident in SQLite (or a local JSON store fallback), documenting the regex fingerprint of the failure trace.
2. **Fingerprint Matching**: If the same regex pattern occurs $\ge 2$ times within recent executions, the SCAR Guard triggers.
3. **STOP Block Injection**: Before generating a completion, the agent queries SCAR. If a repeating error is matched, a loud instructions block is injected at the top of the prompt:
   > `WARNING: You are in a recursive error loop. The previous action resulted in: [Error Pattern]. Do NOT attempt that action again. Pivot your implementation strategy.`

---

## 🔍 2. Graphify: Codebase AST Intelligence
The **Graphify** engine enables agents to walk a workspace and construct an in-memory graph of file dependencies without loading entire code bodies into context.

- **Python**: Uses the native `ast` parser to inspect `Import` and `ImportFrom` nodes. It handles relative imports and maps project connections.
- **JavaScript**: Employs robust AST regex mapping to locate ESM `import` statements and CommonJS `require` statements.
- **Blast Radius Querying**: By calling `queryNeighbors(file)`, the system calculates:
  - **Dependencies**: What files does this file rely on?
  - **Dependents**: What files will break or need modification if this file changes?
- The resulting tree is formatted as a compact context block for the LLM during planning phases.

---

## 🚦 3. Multi-Provider Router & Circuit Breakers
To avoid API downtime from breaking production lines, the LLM router acts as an intelligent proxy.

1. **Task Fallback Chains**: Router categorizes requests (e.g., `code`, `ui`, `content`) and assigns customized chains:
   - `content` -> `['gemini', 'openai', 'anthropic', 'ollama']`
2. **Session Circuit Breaker**: If a provider fails completely across multiple models, the router opens a session circuit breaker for that provider, omitting it from subsequent calls in the active session.
3. **Model Prompt Wrapping**: Dynamically wraps instructions based on the targeted model (e.g., wrapping instructions in `<role>` XML nodes for Gemini to improve system obedience).

---

## 🔄 4. Resilient Fallbacks (Keyless & Zero-Config Defaults)
A primary design philosophy of Equilibrium is that **it must work out of the box** without external dependencies. 

| Production Stack Component | Fallback Component | Implementation Detail |
|---|---|---|
| **Redis Distributed Queue** | `asyncio.Queue` / `EventEmitter` | If Redis connection fails, the manager uses local async queues and events. |
| **better-sqlite3 / SQLite DB** | In-Memory `Map` + JSON File storage | Dynamically imports sqlite. If missing, writes to `data/cache.json`, `data/users.json`. |
| **SerpAPI / Tavily API** | Keyless DuckDuckGo Scraper | Scraping the HTML index at `html.duckduckgo.com` and parsing with regex fallbacks. |
| **bcrypt / passlib** | Native PBKDF2 Hashing | Uses standard library modules (`crypto.pbkdf2Sync` and `hashlib.pbkdf2_hmac`). |
