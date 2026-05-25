# Atzmut OS — Punchlist

Spec: atzmutos-build-pack-b.md  
Status: 11/11 tests passing, build clean.  
Gaps identified by comparing spec against src/.

---

- [x] AT-1 | AGENT | risk:low | Fix `package.json` test script from `"vitest"` to `"vitest run"` so `npm test` exits cleanly in TTY instead of entering watch mode (spec explicitly specifies `vitest run`)  -> PR #1
- [ ] AT-2 | DECISION | risk:low | Delete `src/store.ts` — legacy stub with `export {}`, not in spec scaffold, not imported anywhere
- [ ] AT-3 | DECISION | risk:low | Delete `src/intercept.ts` — legacy stub with `export {}`, not in spec scaffold, not imported anywhere
- [ ] AT-4 | DECISION | risk:low | Delete `src/types/chayyot-verdict.ts` — legacy stub with `export {}`, not in spec scaffold, not imported anywhere
- [x] AT-5 | AGENT | risk:low | Delete 4 orphan `.gitkeep` files from now-populated src/ subdirs (`src/storage/`, `src/tools/`, `src/utils/`, `src/validators/`) — git tracks non-empty dirs automatically  -> PR #2
- [ ] AT-6 | DECISION | risk:med | `auditQuery` returns `total: events.length` after slicing to the limit, so callers can't distinguish "10 results" from "10 out of 500 matched" — decide whether `total` should be the pre-limit match count
- [ ] AT-7 | DECISION | risk:med | Decision logic blocks on `nesher.level === 'BLOCKED'` in addition to `'CRITICAL'` — spec only specifies `'CRITICAL'`; verify what levels `@reshimu/nesher` actually emits and whether this guard is correct or should be removed
- [ ] AT-8 | DECISION | risk:med | `.mcp.json` is gitignored and deferred in spec — decide when to create it and whether to track a template (local paths make it per-machine) to wire the server into Claude Code
- [ ] AT-9 | DECISION | risk:med | `updateBeiurStatus()` is implemented in storage but no MCP tool exposes Beiur resolution (APPROVED/REJECTED) — spec defers to v0.2.0; decide timeline and whether to add `atzmutos_resolve_beiur` now
- [ ] AT-10 | DECISION | risk:med | Expired sessions accumulate in `sessions.json` indefinitely — spec defers "session expiry enforcement" to v0.2.0; decide whether a cleanup sweep or TTL-based eviction is needed before first live use
