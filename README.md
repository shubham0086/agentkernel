# AgentKernel

> **IMPORTANT**: This repository contains real, production-ready, battle-tested code extracted directly from active commercial systems (like Agency OS or Founder Growth OS), rather than simplified mock learning artifacts.
>
> For project walkthroughs, architecture flowcharts, and system context, visit the live landing page: [my-portfolio-github-io-beta-five.vercel.app/projects/equilibrium.html](https://my-portfolio-github-io-beta-five.vercel.app/projects/equilibrium.html)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python Version](https://img.shields.io/badge/python-3.9+-blue.svg)](pyproject.toml)
[![JS Standard](https://img.shields.io/badge/JS-ESModules--ESM-brightgreen.svg)](package.json)
[![Redis Queue](https://img.shields.io/badge/Distributed%20Queue-Redis-red.svg)](docker-compose.yml)
[![SQLite Sovereign Memory](https://img.shields.io/badge/Memory%20Store-SQLite-lightblue.svg)](python/engines/02_memory)
[![Video as Code](https://img.shields.io/badge/Video--as--Code-Remotion-ff69b4.svg)](esm/engines/05_media)

<div align="center">

![AgentKernel — a request flowing through six engines](engines.svg)

</div>

**Building the nervous system of autonomous software.**

AgentKernel is a production-first infrastructure layer for autonomous systems.

It provides the core capabilities required to build reliable AI-powered software:

- Orchestration
- Memory
- Routing
- Execution
- Recovery
- Observability

Most AI frameworks help agents think.

AgentKernel helps autonomous systems operate.

---

## Visual Architecture

**Six engines — how they compose:**

```mermaid
graph LR
    APP([Your App]) --> R01

    subgraph INFRA ["AgentKernel Engines"]
        direction TB
        R01[01 Router\nLLM routing + circuit breaker\nBedrock → OpenAI → Ollama]
        R02[02 Memory\nSHA-256 idempotency cache\nSCAR repeat-failure guard]
        R03[03 Retriever\nWeb search + Firecrawl\ndependency graphing]
        R04[04 Queue\nRedis distributed queue\nSSE streaming + concurrency]
        R05[05 Media\nTTS 6 providers\nRemotion video rendering]
        R06[06 Auth\nJWT + multi-tenant\nPrisma / SQLAlchemy]
    end

    R01 --> R02
    R02 --> R03
    R03 --> R04
    R04 --> OUT([Artifact])
    R05 --> OUT
    R06 --> OUT

    style APP  fill:#0f172a,stroke:#6366f1,color:#818cf8
    style R01  fill:#1e293b,stroke:#6366f1,color:#f8fafc
    style R02  fill:#1e293b,stroke:#818cf8,color:#f8fafc
    style R03  fill:#1e293b,stroke:#a855f7,color:#f8fafc
    style R04  fill:#1e293b,stroke:#a855f7,color:#f8fafc
    style R05  fill:#1e293b,stroke:#f59e0b,color:#f8fafc
    style R06  fill:#1e293b,stroke:#10b981,color:#f8fafc
    style OUT  fill:#0f172a,stroke:#10b981,color:#10b981
```

**Architecture reference (all 6 engines annotated):**

![AgentKernel Architecture Reference](diagrams/agentkernel-flowchart.svg)

**Animated engine map (open in browser):**

The `visual/` folder contains `visual-agentkernel.html` — a standalone animated diagram showing all 6 engines lighting up as a request flows through the stack. No dependencies, no build step.

```
open visual/visual-agentkernel.html
# or: python -m http.server 8080 → localhost:8080/visual/visual-agentkernel.html
```

> Full portfolio case study with live animations: [my-portfolio-github-io-beta-five.vercel.app/projects/equilibrium.html](https://my-portfolio-github-io-beta-five.vercel.app/projects/equilibrium.html)

---

## The Six Engines

AgentKernel is six modular, production-ready engines written in both Async Python and ESM JavaScript. Every engine is independently useful; use one or wire them together.

| Engine | What It Does | Location |
|--------|--------------|----------|
| **01 Router** | Multi-provider LLM routing with circuit breakers, fallover chains, token optimization | `python/engines/01_router/`, `esm/engines/01_router/` |
| **02 Memory** | Sovereign cached memory (SCAR repeat-failure guard, SHA-256 idempotency cache) | `python/engines/02_memory/`, `esm/engines/02_memory/` |
| **03 Retriever** | Web search, Firecrawl scraping, dependency graphing, content analysis | `python/engines/03_retriever/`, `esm/engines/03_retriever/` |
| **04 Queue** | Distributed task queue with circuit breaker, concurrency control, SSE streaming | `python/engines/04_queue/`, `esm/engines/04_queue/` |
| **05 Media** | TTS voice synthesis (6 providers), subtitle generation, story templates | `python/engines/05_media/`, `esm/engines/05_media/` |
| **06 Auth** | JWT auth, multi-tenant database CRUD, Prisma/SQLAlchemy schemas | `python/engines/06_auth/`, `esm/engines/06_auth/` |

---

## 🚀 Get Started (Pick Your Path)

**New to AgentKernel?** Start here. Choose based on what you're building:

### Path A: Single Engine (Just the Router)
**Best for**: Testing LLM routing, learning fallback chains, optimizing tokens
```bash
cd python/engines/01_router
python -m venv venv && source venv/bin/activate
pip install httpx pyjwt
# Edit .env with your API keys (or just use Ollama)
python -c "from router import Router; r = Router(); print('Router ready!')"
```
**Time**: 5 minutes | **Cost**: $0 (if using Ollama)

### Path B: Common Combo (Router + Memory + Retriever)
**Best for**: Building research agents, RAG systems, content analysis pipelines
```bash
cd python
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python examples/research-video-assistant/run_assistant.py
```
**Time**: 15 minutes | **Cost**: $0-2 (search API free tier)

### Path C: Full Stack (All 6 Engines)
**Best for**: Production AI apps, outreach automation, end-to-end pipelines
```bash
docker-compose up --build
# Full stack running at http://localhost:8000
# Python API, Redis queue, SQLite, video rendering, auth
```
**Time**: 30 minutes | **Cost**: $0-5 (with Docker, no external APIs)

---

### Vibecoder Problems This Solves

| Your Problem | AgentKernel Solution |
|--------------|---------------------|
| "LLM costs blowing up" | Engine 01: token optimizer saves 20-30%, fallback chains = no vendor lock-in |
| "API goes down = app down" | Every engine has keyless fallback (Ollama, DuckDuckGo, in-memory) |
| "Can't deploy reliably" | Docker-compose.yml provided, runs locally or any cloud |
| "Search APIs are expensive" | Engine 03: $0 DuckDuckGo fallback if paid APIs fail |
| "Don't know how to do video" | Engine 05: Remotion template + TTS, render in minutes |
| "Auth is annoying" | Engine 06: JWT + PBKDF2, zero external deps, just works |
| "Same error keeps happening" | Engine 02: SCAR guard blocks repeated failures |
| "Too many moving parts" | All engines work standalone OR together — pick what you need |

---

## 🛠️ The 6 Core Engines

### 01. Multi-Provider LLM Router & Guardrails
- **Failover Chains**: Automated transitions across OpenAI, Anthropic, Gemini, and local Ollama channels.
- **Model Prompts Styling**: Automatically wraps inputs into XML tags for Gemini, constraints for Moonshot, and concise frames for Nova.
- **Security Checkpoints**: Active input prompt injection blockades and key output redaction streams.

### 02. Sovereign SQLite Memory & SCAR Guard
- **SHA-256 Response Cache**: Automatically avoids duplicate LLM invocation costs.
- **SCAR (Sovereign Critical Action Record)**: Tracks incident errors. If the same fingerprint is detected twice, it injects a warning `STOP` block directly at the top of the prompt payload.

### 03. Scraper & Context Retriever
- **Graphify AST**: Parses folder files recursively, outputting dependency nodes and blast-radius vectors using Python's `ast` package and JS regex parsers.
- **Aggregated Search & Keyless Fallback**: Supports Tavily, SerpAPI, and Brave search channels, falling back to a **keyless DuckDuckGo scraper** if API credentials are missing.
- **Firecrawl Scraper**: Performs structured lead extraction from targets (e.g., IndiaMART product sheets).

### 04. Redis Task Queue, SSE Stream & Circuit Breaker
- **Redis Queue Manager**: Distributed worker heartbeats and priority execution queues, falling back to an **in-memory event queue** when Redis is unavailable.
- **Event Streaming**: Server-Sent Events (SSE) server stream handlers with built-in connection ping pings.
- **Circuit Breaker**: Standalone async circuit breakers to prevent infinite execution loops and cascade network blocks.

### 05. Video-as-Code & Copywriting outreach
- **Universal Remotion template**: Vertically aligned React composition featuring Ken Burns image pan zooms, audio synchronizers, captions overlay, and takeaway moral cards.
- **Voice synthesizers**: Handles ElevenLabs voice synthesis and Gemini prebuilt TTS voices, compiling raw PCM formats into WAV containers.
- **ChaiPitch copywriter**: AI messaging system generating Hinglish WhatsApp pitches for Indian D2C leads.

### 06. Sovereign Auth & SQLite Database
- **Native Security**: Native crypto-based PBKDF2 password hashing and base64 JWT token signatures without external dependencies.
- **Entity CRUD**: Prepared schemas and CRUD operations for Users, Leads, and Outreach messages.

---

## 📂 Repository Directory Layout

```
agentkernel/
├── LICENSE                        ← MIT License
├── README.md                      ← Recruiter overview
├── QUICK_START.md                 ← Fast setup guide
├── ARCHITECTURE.md                ← In-depth design patterns
├── docker-compose.yml             ← Container services
│
├── python/                        ← Python Suite
│   ├── engines/
│   │   ├── 01_router/             ← LLM Router & Guardrails
│   │   ├── 02_memory/             ← Cache & SCAR Guard
│   │   ├── 03_retriever/          ← Graphify & Scrapers
│   │   ├── 04_queue/              ← Redis Queue & Circuit Breakers
│   │   ├── 05_outreach/           ← ChaiPitch copywriter
│   │   └── 06_auth/               ← Database & Hashing
│   ├── pyproject.toml
│   └── requirements.txt
│
└── esm/                           ← ESM JavaScript Suite (ESModules)
    ├── engines/
    │   ├── 01_router/             ← LLM Router & Guardrails
    │   ├── 02_memory/             ← Cache & SCAR Guard
    │   ├── 03_retriever/          ← Graphify & Scrapers
    │   ├── 04_queue/              ← Redis Queue & Circuit Breakers
    │   ├── 05_media/              ← Remotion, Voice, ChaiPitch JS
    │   └── 06_auth/               ← Database & Prisma config
    ├── package.json
    └── tsconfig.json
```

---

## Example: Research Video Assistant

The `examples/research-video-assistant/` folder shows all 6 engines wired together into a single app: scrape leads, store them, generate Hinglish outreach copy, route through the LLM, cache the response, and render a Remotion video with TTS voice.

```mermaid
graph TD
    A[Scraper & Retriever Engine 03] -->|Raw Lead Data| B(Auth & Database Engine 06)
    B -->|Persisted Leads| C[ChaiPitch Outreach Engine 05]
    C -->|Draft Message Prompts| D[Multi-Provider LLM Router Engine 01]
    D -->|Active Input Guardrails Check| D1[Guardrails & Sanitizer]
    D1 -->|Token-Optimized Prompts| E[Model Failover Chain]
    E -->|API Timeout or Error| E1[Fallback Provider]
    E -->|Successful Generation| F[Sovereign Cache Memory Engine 02]
    F -->|Fingerprinted SHA-256 Hit| E
    F -->|SCAR Repeat Failures Guard| D
    E -->|Narration Script & Copy| G[Remotion Video Composition Engine 05]
    G -->|ElevenLabs/Gemini TTS Voice| H[Video rendering output]

    style A fill:#4CAF50,stroke:#333,stroke-width:2px,color:#fff
    style D fill:#2196F3,stroke:#333,stroke-width:2px,color:#fff
    style F fill:#9C27B0,stroke:#333,stroke-width:2px,color:#fff
    style G fill:#E91E63,stroke:#333,stroke-width:2px,color:#fff
```

Run it:
```bash
# Python
python examples/research-video-assistant/run_assistant.py

# JavaScript
node examples/research-video-assistant/run_assistant.js
```
