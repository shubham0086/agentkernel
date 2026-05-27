# Contributing to Equilibrium

Thanks for your interest in contributing! Equilibrium is built by and for the vibecoding community. All contributions—bug fixes, new engines, better examples, docs—are welcome.

---

## Before You Start

**Read this first:**
- [ARCHITECTURE.md](ARCHITECTURE.md) — understand the 6-engine design
- [QUICK_START.md](QUICK_START.md) — verify you can run the reference app locally
- The relevant engine's README in `python/engines/*/` or `esm/engines/*/`

---

## Types of Contributions

### 🐛 Bug Fixes
1. **Open an issue first** describing the bug and how to reproduce it
2. Fork, create a branch: `git checkout -b fix/issue-123`
3. Fix the bug + add a test case
4. Run tests: `pytest python/tests/` (Python) or `npm test` (ESM)
5. Commit: `fix: describe the bug and solution`
6. Open a PR with a clear description

### ✨ New Features
1. **Open a discussion issue** describing the feature and why it's needed (don't start coding yet)
2. Wait for feedback — we prioritize features that solve real vibecoder problems
3. If approved, implement following the patterns in the existing engines
4. Add tests + docs
5. Open a PR referencing the issue

### 📚 Documentation
- Typos, unclear explanations, missing examples: PRs welcome directly
- New guides (e.g., "How to add a custom search provider"): open an issue first

### 🔧 Engine Improvements
For changes to core engines (router, memory, auth, etc.):
1. **Test locally first** — ensure all existing tests pass before modifying
2. **Maintain backward compatibility** — breaking changes need discussion
3. Add tests for your improvement
4. Update the engine's README if the API changes

---

## Development Setup

### Python
```bash
cd python
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### ESM JavaScript
```bash
cd esm
npm install
```

---

## Testing

### Python Tests
```bash
cd python
pytest tests/ -v
# Run specific test: pytest tests/test_router.py::test_guardrails_input_check -v
```

### ESM Tests
```bash
cd esm
npm test
```

### Manual Testing
**Python reference app:**
```bash
cd python
python examples/research-video-assistant/run_assistant.py
```

**ESM reference app:**
```bash
cd esm
node examples/research-video-assistant/run_assistant.js
```

---

## Code Style

### Python
- Follow PEP 8
- Use type hints: `def process(data: str) -> Dict[str, Any]:`
- Max line length: 120 chars
- Use docstrings for classes and public methods

### JavaScript
- ESM imports only (no CommonJS)
- Use async/await (not Promise chains)
- Const by default, let when needed, never var
- Max line length: 120 chars

---

## Commit Messages

```
type: short summary (max 50 chars)

Optional longer explanation if the change is complex.
Explain WHY, not just WHAT.

Fixes #issue-number (if applicable)
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`

Examples:
```
feat: add duckduckgo fallback to search aggregator

Previously, if all paid search APIs failed, the system would crash.
Now it falls back to a keyless DuckDuckGo scraper for resilience.
This enables free users to still get search results.

Fixes #87
```

---

## Security & Safety

### Before Opening a PR
- [ ] No `.env` files committed (only `.env.example`)
- [ ] No API keys, secrets, or credentials in code/comments
- [ ] No hardcoded server paths or internal IPs
- [ ] Guardrails & sanitization tests pass
- [ ] Sensitive data is redacted in logs/traces

### For Engine Changes
- [ ] If you modify input handling: add guardrail tests
- [ ] If you modify output handling: add sanitization tests
- [ ] If you touch auth: ensure JWT secrets aren't logged

Run the security check:
```bash
git log --all -p | grep -iE "(password|secret|api.?key|token|bearer|sk-)" | head
```
If anything appears → don't commit.

---

## PR Review Process

1. **Automated checks** — GitHub Actions runs tests, linting, security scans
2. **Code review** — maintainers review for:
   - Correctness (does it work as described?)
   - Maintainability (would another dev understand this in 6 months?)
   - Safety (no secrets, no security holes?)
   - Performance (doesn't degrade responsiveness?)
3. **Feedback cycle** — we may ask for changes; no shame in iteration
4. **Merge** — once approved, we'll merge and backport to docs

---

## Big Picture: What Equilibrium Needs

If you're not sure where to start, here's what the community benefits most from:

| Priority | Area | What helps |
|----------|------|-----------|
| ⭐⭐⭐ | **Fallback chains** | New search provider integration + tests (e.g., Bing, Perplexity) |
| ⭐⭐⭐ | **Resilience** | Real-world incident reports + fixes (e.g., "circuit breaker stuck on timeout") |
| ⭐⭐ | **Docs** | Video walkthroughs, Jupyter notebooks for Path A/B/C setup |
| ⭐⭐ | **Performance** | Token optimization PRs, latency profiling |
| ⭐ | **Examples** | New reference apps (e.g., "Sentiment Analysis as a Service", "Automated Code Review") |

---

## Questions?

- **How do I add a new LLM provider?** → See `python/engines/router/router.py` (add provider config + `_call_*` method)
- **How do I add a new database backend?** → See `python/engines/auth/database.py` (it's abstracted via SQLAlchemy)
- **How do I deploy this?** → See `docker-compose.yml` or [ARCHITECTURE.md](ARCHITECTURE.md#deployment)
- **Something else?** → Open a discussion issue

---

## License

By contributing, you agree your code is licensed under MIT (Python + ESM). Documentation contributions are CC BY 4.0.

---

**Thank you for building with us!** 🚀
