# Atzmut OS — Punchlist
Spec: atzmutos-build-pack-b.md
Status: 11/11 tests passing, build clean.

---

- [ ] AT-11 | AGENT | risk:low | Delete 3 confirmed-dead legacy stubs: src/store.ts, src/intercept.ts, src/types/chayyot-verdict.ts — each is a one-line `export {}` with a comment naming its replacement; verified not imported
- [x] AT-12 | AGENT | risk:low | Fix `auditQuery` to report pre-limit match count in `total` so callers can distinguish "10 results" from "10 of 500 matched"  -> PR #3
- [ ] AT-7 | AGENT | risk:low | Update atzmutos-build-pack-b.md risk-level list to include `BLOCKED` — NESHER emits SAFE/CAUTION/CRITICAL/CRITICAL/BLOCKED; spec only lists CRITICAL. The code is correct; the spec is stale. Fix the doc, not the code.
- [ ] AT-8 | DECISION | risk:med | `.mcp.json` is gitignored and deferred in spec — decide when to create it and whether to track a per-machine template
- [ ] AT-9 | DECISION | risk:med | `updateBeiurStatus()` is wired in storage but no MCP tool exposes Beiur resolution — spec defers to v0.2.0; decide timeline
- [ ] AT-10 | DECISION | risk:med | Expired sessions accumulate in sessions.json indefinitely — spec defers expiry to v0.2.0; decide cleanup approach before first live use
