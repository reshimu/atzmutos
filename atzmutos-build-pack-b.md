# Build Pack B — Atzmut OS MCP Server
# Autonomous build for Claude Code. Paste one step at a time into a Claude Code session.
# Each step is self-contained. Verify the DONE criteria before moving to the next.
# All work at: C:\Users\shimo\OneDrive\Desktop\atzmutos
# No npm publish. No GitHub push. Build only.

---

## ARCHITECTURE LOCKED — DO NOT REDESIGN

**Package:** @reshimu/atzmutos (TypeScript, MCP server)
**Runtime:** Node.js, @modelcontextprotocol/sdk
**Persistence:** JSON file storage only — no SQLite, no native dependencies
**Chayyot validators:** @reshimu/nesher (npm), @reshimu/shor (npm), @reshimu/aryeh (local link), PANIM ADAM (inline logic)

**Seven MCP tools:**
1. `atzmutos_register_session` — register an agent session with a covenant (intent + authorized tools + scope)
2. `atzmutos_intercept` — main intercept: classify a proposed action through all four Chayyot, return decision
3. `atzmutos_classify_action` — standalone action classification without a session (preview/test mode)
4. `atzmutos_file_beiur` — file a gray-zone escalation (Beiur Report) for human review
5. `atzmutos_get_covenant` — retrieve the covenant for an active session
6. `atzmutos_session_report` — structured report of all intercepts, decisions, and Beiur Reports for a session
7. `atzmutos_audit_query` — query the audit log across sessions by time range, decision type, or tool name

**Hierarchy:** ATZMUS (root intent) → session covenant → intercept pipeline → four Chayyot → decision
**Inversion doctrine:** governance flows downward to enable execution, not constrain it. The intercept is a gate, not a cage.
**Beiur Report:** replaces "Nogah Report" — gray-zone escalation filed when PANIM ADAM flags ambiguity

**Decision types returned by intercept:**
- `PASS` — all Chayyot clear
- `PASS_WITH_LOG` — passed but one or more Chayyot flagged a non-blocking concern
- `BLOCK` — hard block from NESHER (irreversible) or SHOR (ungrounded) or ARYEH (out of scope)
- `ESCALATE` — PANIM ADAM gray-zone flag, Beiur Report auto-filed, human review required

---

## STEP 1 — Scaffold

**Paste this into a fresh Claude Code session.**

```
I'm building the Atzmut OS MCP server from scratch.
Working directory: C:\Users\shimo\OneDrive\Desktop\atzmutos
Do not create this directory — scaffold everything inside it assuming it exists or create it if needed.

Build the following scaffold exactly. No extra files, no deviations.

DIRECTORY STRUCTURE:
atzmutos/
  src/
    index.ts          ← MCP server entry point
    tools/
      register-session.ts
      intercept.ts
      classify-action.ts
      file-beiur.ts
      get-covenant.ts
      session-report.ts
      audit-query.ts
    storage/
      index.ts        ← storage module (read/write JSON)
      schema.ts       ← all TypeScript types
    validators/
      index.ts        ← Chayyot validator orchestration (imports nesher, shor, aryeh stub, panim-adam inline)
    utils/
      ids.ts          ← nanoid-based ID generation
      time.ts         ← timestamp helpers
  data/               ← runtime JSON storage (gitignored)
    .gitkeep
  package.json
  tsconfig.json
  .gitignore
  README.md

PACKAGE.JSON:
{
  "name": "@reshimu/atzmutos",
  "version": "0.1.0",
  "description": "Atzmut OS — runtime governance MCP server for autonomous agents",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "dev": "tsx watch src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@reshimu/nesher": "^0.1.0",
    "@reshimu/shor": "^0.1.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.0.0",
    "vitest": "^1.6.0",
    "@types/node": "^20.0.0"
  }
}

TSCONFIG.JSON:
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}

.GITIGNORE:
node_modules/
dist/
data/*.json

README.md: single line for now — "# @reshimu/atzmutos — Atzmut OS MCP Server"

After creating all files, run:
  npm install

DONE CRITERIA:
- All directories and files exist
- npm install completes with no errors
- npx tsc --noEmit runs with no errors (all files are empty stubs at this point — that's fine, just ensure no syntax errors in any scaffolded content)
- data/.gitkeep exists, data/ directory is present
```

---

## STEP 2 — Storage layer + TypeScript schema

**Paste this into Claude Code after Step 1 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build the complete storage layer. Two files: src/storage/schema.ts and src/storage/index.ts

--- src/storage/schema.ts ---

Define and export these TypeScript types. No imports needed except nanoid types.

// A covenant is the root intent + authorization for a session
export interface Covenant {
  sessionId: string
  agentId: string
  intent: string                    // natural language statement of what this agent session is trying to accomplish
  authorizedTools: string[]         // list of tool names this session is permitted to call
  authorizedScope: string[]         // list of resource identifiers or scope tags
  createdAt: string                 // ISO timestamp
  expiresAt?: string                // ISO timestamp, optional
  metadata?: Record<string, unknown>
}

// A single intercept event — one proposed action classified
export interface InterceptEvent {
  eventId: string
  sessionId: string
  timestamp: string
  proposedAction: {
    tool: string
    input: Record<string, unknown>
    outputSummary?: string          // optional: the agent output that produced this action
    sources?: string[]              // optional: source material for SHOR grounding check
  }
  chayyotResults: {
    nesher: { level: string; irreversible: boolean; escalate: boolean }
    shor: { level: string; score: number; unmatched: string[] }
    aryeh: { level: string; inScope: boolean; reason: string }
    panimAdam: { level: string; isGrayZone: boolean; reason: string }
  }
  decision: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  decisionReason: string
  beiurReportId?: string            // populated if decision === 'ESCALATE'
}

// A Beiur Report — gray-zone escalation for human review
export interface BeiurReport {
  reportId: string
  sessionId: string
  eventId: string
  filedAt: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  panimAdamReason: string
  proposedAction: {
    tool: string
    input: Record<string, unknown>
  }
  resolution?: {
    decision: 'APPROVED' | 'REJECTED'
    resolvedAt: string
    resolvedBy: string
    notes?: string
  }
}

// Storage root shapes — one file per entity type in data/
export interface SessionStore {
  sessions: Record<string, Covenant>
}

export interface InterceptStore {
  events: InterceptEvent[]
}

export interface BeiurStore {
  reports: BeiurReport[]
}

--- src/storage/index.ts ---

JSON file storage module. All reads/writes are synchronous (fs.readFileSync / writeFileSync).
Storage path: process.cwd() + '/data/'
Three files: sessions.json, intercepts.json, beiurs.json

Export these functions:

readSessions(): SessionStore
writeSessions(store: SessionStore): void

readIntercepts(): InterceptStore
writeIntercepts(store: InterceptStore): void

readBeiurs(): BeiurStore
writeBeiurs(store: BeiurStore): void

// Convenience helpers
getSession(sessionId: string): Covenant | null
saveSession(covenant: Covenant): void
appendIntercept(event: InterceptEvent): void
appendBeiur(report: BeiurReport): void
getInterceptsBySession(sessionId: string): InterceptEvent[]
getBeiursBySession(sessionId: string): BeiurReport[]
getBeiurById(reportId: string): BeiurReport | null
updateBeiurStatus(reportId: string, update: Partial<BeiurReport>): void

Each read function: if file does not exist, return empty default (empty sessions object, empty events array, empty reports array). Never throw on missing file.
Each write function: JSON.stringify with 2-space indent.

--- src/utils/ids.ts ---
import { nanoid } from 'nanoid'
export const sessionId = () => `ses_${nanoid(12)}`
export const eventId = () => `evt_${nanoid(12)}`
export const reportId = () => `beiur_${nanoid(12)}`

--- src/utils/time.ts ---
export const now = () => new Date().toISOString()
export const isExpired = (expiresAt?: string) => expiresAt ? new Date(expiresAt) < new Date() : false

DONE CRITERIA:
- npx tsc --noEmit passes with no errors
- All exported functions exist and have correct signatures
- Storage functions default-initialize missing files rather than throwing
```

---

## STEP 3 — Validators layer

**Paste into Claude Code after Step 2 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build src/validators/index.ts — the Chayyot orchestration layer.

This module imports @reshimu/nesher and @reshimu/shor from npm.
For @reshimu/aryeh: it may not be installed — check if it's available. If not, implement a stub that returns { level: 'PASS', inScope: true, reason: 'aryeh-stub' } for all inputs. Do NOT throw if aryeh is missing.
PANIM ADAM is inline logic — no import.

Export one function:

export interface ValidatorInput {
  tool: string
  input: Record<string, unknown>
  outputSummary?: string
  sources?: string[]
  authorizedTools: string[]
  authorizedScope: string[]
}

export interface ValidatorResults {
  nesher: { level: string; irreversible: boolean; escalate: boolean }
  shor: { level: string; score: number; unmatched: string[] }
  aryeh: { level: string; inScope: boolean; reason: string }
  panimAdam: { level: string; isGrayZone: boolean; reason: string }
  decision: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  decisionReason: string
}

export async function runChayyot(input: ValidatorInput): Promise<ValidatorResults>

NESHER call:
  import { classify as nesherClassify } from '@reshimu/nesher'
  Pass: { action: input.tool, target: JSON.stringify(input.input) }
  Map result to: { level: result.level, irreversible: result.irreversible ?? false, escalate: result.escalate ?? false }

SHOR call:
  import { classify as shorClassify } from '@reshimu/shor'
  Only call if input.outputSummary is provided AND input.sources?.length > 0
  If not provided: return { level: 'INDETERMINATE', score: 0, unmatched: [] }
  Pass: { output: input.outputSummary, sources: input.sources }
  Map result to: { level: result.level, score: result.score ?? 0, unmatched: result.unmatched ?? [] }

ARYEH call:
  Check if tool name is in authorizedTools array (exact string match).
  Check if any authorizedScope tag appears in JSON.stringify(input.input).
  If tool not in authorizedTools: { level: 'BLOCK', inScope: false, reason: `tool ${input.tool} not in authorized set` }
  Else if scope check fails: { level: 'PASS_WITH_LOG', inScope: true, reason: 'scope tag not matched but tool authorized' }
  Else: { level: 'PASS', inScope: true, reason: 'authorized' }
  (This is the inline ARYEH implementation — replace with @reshimu/aryeh import when published)

PANIM ADAM inline logic:
  Gray zone triggers (any one = isGrayZone true):
    - SHOR level is PARTIAL (grounded but not fully)
    - NESHER level is CAUTION
    - tool name contains 'delete' or 'remove' or 'send' but NESHER did not flag CRITICAL
    - input.outputSummary contains 'not sure' or 'unclear' or 'approximate' (case-insensitive)
  If isGrayZone: { level: 'ESCALATE', isGrayZone: true, reason: [first matched trigger] }
  Else: { level: 'PASS', isGrayZone: false, reason: 'no gray zone indicators' }

DECISION LOGIC (in order — first match wins):
  1. nesher.level === 'CRITICAL' → BLOCK, reason: 'irreversible action blocked by NESHER'
  2. shor.level === 'UNGROUNDED' → BLOCK, reason: 'ungrounded output blocked by SHOR'
  3. aryeh.level === 'BLOCK' → BLOCK, reason: aryeh.reason
  4. panimAdam.isGrayZone → ESCALATE, reason: panimAdam.reason
  5. nesher.level === 'CAUTION' || shor.level === 'PARTIAL' || aryeh.level === 'PASS_WITH_LOG' → PASS_WITH_LOG, reason: 'non-critical flags present'
  6. default → PASS, reason: 'all Chayyot clear'

DONE CRITERIA:
- npx tsc --noEmit passes
- runChayyot exported and typed correctly
- Aryeh stub handles missing package gracefully (try/catch or conditional import)
- Decision logic covers all four return types
```

---

## STEP 4 — Tools: register_session + get_covenant + classify_action

**Paste into Claude Code after Step 3 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build three MCP tool handler files. Each exports a handler function — NOT an MCP server. The server wires them in Step 7.

--- src/tools/register-session.ts ---

import { Covenant } from '../storage/schema.js'
import { saveSession, getSession } from '../storage/index.js'
import { sessionId, now } from '../utils/ids.js'  // adjust imports as needed

export interface RegisterSessionInput {
  agentId: string
  intent: string
  authorizedTools: string[]
  authorizedScope: string[]
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface RegisterSessionOutput {
  sessionId: string
  covenant: Covenant
  alreadyExists: boolean
}

export async function registerSession(input: RegisterSessionInput): Promise<RegisterSessionOutput> {
  // Generate session ID, create covenant, persist, return
  // If a session for the same agentId + intent already exists and is not expired, return it with alreadyExists: true
  // Check expiry using isExpired() from utils/time.ts
}

--- src/tools/get-covenant.ts ---

import { getSession } from '../storage/index.js'
import { isExpired } from '../utils/time.js'

export interface GetCovenantInput {
  sessionId: string
}

export interface GetCovenantOutput {
  found: boolean
  expired: boolean
  covenant: import('../storage/schema.js').Covenant | null
}

export async function getCovenant(input: GetCovenantInput): Promise<GetCovenantOutput>

--- src/tools/classify-action.ts ---

Preview/test mode — classifies an action WITHOUT requiring an active session.
Uses runChayyot with a permissive scope (authorizedTools: ['*'], authorizedScope: ['*']).
Returns the full ValidatorResults. Does not write to storage.

export interface ClassifyActionInput {
  tool: string
  input: Record<string, unknown>
  outputSummary?: string
  sources?: string[]
}

export async function classifyAction(input: ClassifyActionInput): Promise<import('../validators/index.js').ValidatorResults>

DONE CRITERIA:
- npx tsc --noEmit passes
- registerSession creates and persists a Covenant with a generated sessionId
- getCovenant returns found: false cleanly when sessionId doesn't exist
- classifyAction runs all four Chayyot and returns a decision without writing to disk
```

---

## STEP 5 — Tools: intercept + file_beiur

**Paste into Claude Code after Step 4 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build two more tool handlers — the core of the intercept pipeline.

--- src/tools/intercept.ts ---

This is the main tool. Every agent action flows through here.

import { getSession } from '../storage/index.js'
import { isExpired } from '../utils/time.js'
import { runChayyot } from '../validators/index.js'
import { appendIntercept, appendBeiur } from '../storage/index.js'
import { eventId, reportId } from '../utils/ids.js'
import { now } from '../utils/time.js'
import type { InterceptEvent, BeiurReport } from '../storage/schema.js'

export interface InterceptInput {
  sessionId: string
  tool: string
  input: Record<string, unknown>
  outputSummary?: string
  sources?: string[]
}

export interface InterceptOutput {
  eventId: string
  sessionId: string
  decision: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  decisionReason: string
  chayyotResults: InterceptEvent['chayyotResults']
  beiurReportId?: string
  sessionError?: string   // populated if session not found or expired
}

export async function intercept(input: InterceptInput): Promise<InterceptOutput>

LOGIC:
1. Load session via getSession(input.sessionId)
2. If not found: return { decision: 'BLOCK', decisionReason: 'session not found', sessionError: 'SESSION_NOT_FOUND', eventId: '', sessionId: input.sessionId, chayyotResults: [zeros] }
3. If expired: return similar with sessionError: 'SESSION_EXPIRED'
4. Run runChayyot({ tool, input, outputSummary, sources, authorizedTools: covenant.authorizedTools, authorizedScope: covenant.authorizedScope })
5. Build InterceptEvent, append to storage
6. If decision === 'ESCALATE': auto-file a BeiurReport, append to storage, include beiurReportId in return
7. Return InterceptOutput

--- src/tools/file-beiur.ts ---

Manual Beiur Report filing — for cases where the agent or orchestrator wants to escalate without going through intercept.

export interface FileBeiurInput {
  sessionId: string
  tool: string
  input: Record<string, unknown>
  reason: string           // human-readable reason for escalation
  eventId?: string         // optional: link to an existing intercept event
}

export interface FileBeiurOutput {
  reportId: string
  filedAt: string
  status: 'PENDING'
}

export async function fileBeiur(input: FileBeiurInput): Promise<FileBeiurOutput>

DONE CRITERIA:
- npx tsc --noEmit passes
- intercept correctly loads covenant, runs all four Chayyot, persists event, auto-files Beiur on ESCALATE
- Session not found and session expired both return BLOCK with sessionError populated
- fileBeiur persists a BeiurReport with status PENDING and returns reportId
```

---

## STEP 6 — Tools: session_report + audit_query

**Paste into Claude Code after Step 5 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build the two reporting tools.

--- src/tools/session-report.ts ---

export interface SessionReportInput {
  sessionId: string
}

export interface SessionReportOutput {
  sessionId: string
  covenant: import('../storage/schema.js').Covenant | null
  summary: {
    totalIntercepts: number
    passed: number
    passedWithLog: number
    blocked: number
    escalated: number
    beiurReportsFiled: number
    beiursPending: number
  }
  events: import('../storage/schema.js').InterceptEvent[]
  beiurReports: import('../storage/schema.js').BeiurReport[]
}

export async function sessionReport(input: SessionReportInput): Promise<SessionReportOutput>

Loads all intercepts and beiur reports for the session. Computes summary counts from decision field.

--- src/tools/audit-query.ts ---

export interface AuditQueryInput {
  // All filters are optional — no filters returns all events
  sessionId?: string
  decision?: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  tool?: string                // exact tool name match
  since?: string               // ISO timestamp — return events after this
  until?: string               // ISO timestamp — return events before this
  limit?: number               // default 100, max 500
}

export interface AuditQueryOutput {
  total: number
  events: import('../storage/schema.js').InterceptEvent[]
  beiurReports: import('../storage/schema.js').BeiurReport[]
}

export async function auditQuery(input: AuditQueryInput): Promise<AuditQueryOutput>

Filter logic:
- sessionId: exact match
- decision: exact match on event.decision
- tool: exact match on event.proposedAction.tool
- since/until: filter on event.timestamp (ISO string comparison)
- limit: slice after filtering, default 100
- beiurReports: return all Beiur Reports whose eventId matches any event in the filtered set

DONE CRITERIA:
- npx tsc --noEmit passes
- sessionReport correctly aggregates counts from events
- auditQuery correctly applies all optional filters and returns matching events + associated beiur reports
```

---

## STEP 7 — MCP server entry point

**Paste into Claude Code after Step 6 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build src/index.ts — the MCP server entry point. This wires all seven tools into the MCP SDK server.

Use @modelcontextprotocol/sdk. Server transport: StdioServerTransport.

Import all seven tool handlers:
  registerSession from './tools/register-session.js'
  intercept from './tools/intercept.js'
  classifyAction from './tools/classify-action.js'
  fileBeiur from './tools/file-beiur.js'
  getCovenant from './tools/get-covenant.js'
  sessionReport from './tools/session-report.js'
  auditQuery from './tools/audit-query.js'

Register seven tools with the MCP server. For each tool, define:
- name (snake_case, e.g. 'atzmutos_register_session')
- description (one sentence, precise)
- inputSchema (JSON Schema object matching the tool's input interface)
- handler: parse input, call the function, return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }

Tool descriptions:
  atzmutos_register_session: "Register an agent session with a covenant defining intent, authorized tools, and scope."
  atzmutos_intercept: "Classify a proposed agent action through all four Chayyot validators and return a governance decision."
  atzmutos_classify_action: "Classify an action in preview mode without requiring an active session. For testing and inspection."
  atzmutos_file_beiur: "File a Beiur Report for manual human review of a gray-zone agent action."
  atzmutos_get_covenant: "Retrieve the covenant for an active session."
  atzmutos_session_report: "Get a structured report of all intercepts and Beiur Reports for a session."
  atzmutos_audit_query: "Query the audit log across sessions by time range, decision type, or tool name."

Server name: 'atzmutos'
Server version: '0.1.0'

After building, run:
  npm run build

DONE CRITERIA:
- npm run build completes with no TypeScript errors
- dist/index.js exists
- node dist/index.js starts without crashing (it will hang waiting for stdio — that's correct MCP behavior)
  Test with: echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
  Should return a JSON response listing all seven tool names
```

---

## STEP 8 — Integration test suite

**Paste into Claude Code after Step 7 is verified.**

```
Working in C:\Users\shimo\OneDrive\Desktop\atzmutos

Build a vitest integration test suite. File: src/__tests__/integration.test.ts

Use vitest. Import tool handlers directly (not through MCP server). Use a temp data directory so tests don't pollute the real data/ folder.

Before all tests: set process.env.ATZMUTOS_DATA_DIR to a temp path (e.g. os.tmpdir() + '/atzmutos-test-' + Date.now())
After all tests: clean up the temp directory

NOTE: You will need to make the storage module respect ATZMUTOS_DATA_DIR env var as the data directory root. Update src/storage/index.ts to use:
  const DATA_DIR = process.env.ATZMUTOS_DATA_DIR ?? path.join(process.cwd(), 'data')

TEST CASES — implement all of these:

1. registerSession — creates a covenant and persists it
   Input: { agentId: 'test-agent', intent: 'send weekly digest emails', authorizedTools: ['send_email', 'read_calendar'], authorizedScope: ['email:outbound', 'calendar:read'] }
   Assert: result.sessionId starts with 'ses_', result.covenant.intent matches, alreadyExists is false

2. getCovenant — retrieves the session from test 1
   Assert: found is true, expired is false, covenant.agentId === 'test-agent'

3. classifyAction — PASS case
   Input: { tool: 'read_calendar', input: { date: 'today' } }
   Assert: decision is 'PASS' or 'PASS_WITH_LOG' (no BLOCK)

4. intercept — PASS case using session from test 1
   Input: { sessionId: [from test 1], tool: 'read_calendar', input: { date: 'today' }, outputSummary: 'Meeting at 2pm in Room B', sources: ['Calendar: 2pm Room B sync'] }
   Assert: decision is 'PASS' or 'PASS_WITH_LOG', eventId starts with 'evt_'

5. intercept — BLOCK case (tool not in authorizedTools)
   Input: { sessionId: [from test 1], tool: 'delete_all_records', input: { confirm: true } }
   Assert: decision is 'BLOCK'

6. intercept — ESCALATE case (gray zone trigger)
   Input: { sessionId: [from test 1], tool: 'send_email', input: { to: 'all@company.com' }, outputSummary: 'I am not sure this is the right list', sources: ['Contact list exported'] }
   Assert: decision is 'ESCALATE', beiurReportId is defined and starts with 'beiur_'

7. fileBeiur — manual escalation
   Input: { sessionId: [from test 1], tool: 'send_email', input: { to: 'ceo@company.com' }, reason: 'Unsolicited contact with executive' }
   Assert: result.status === 'PENDING', result.reportId starts with 'beiur_'

8. sessionReport — aggregates correctly
   Use session from test 1 after tests 4, 5, 6 have run
   Assert: summary.totalIntercepts >= 3, summary.blocked >= 1, summary.escalated >= 1, beiurReports.length >= 1

9. auditQuery — filter by decision
   Input: { decision: 'BLOCK' }
   Assert: all returned events have decision === 'BLOCK'

10. auditQuery — filter by tool
    Input: { tool: 'send_email' }
    Assert: all returned events have proposedAction.tool === 'send_email'

11. intercept — session not found
    Input: { sessionId: 'ses_doesnotexist', tool: 'any_tool', input: {} }
    Assert: decision is 'BLOCK', sessionError is 'SESSION_NOT_FOUND'

Run tests with: npm test

DONE CRITERIA:
- npm test runs without crashing
- All 11 test cases pass
- No real data/ directory is written during tests (temp dir only)
- Final output: "X passed" with X = 11

After all tests pass, print the following summary to confirm the build is complete:

BUILD COMPLETE
==============
Package: @reshimu/atzmutos v0.1.0
Tools: 7 (atzmutos_register_session, atzmutos_intercept, atzmutos_classify_action, atzmutos_file_beiur, atzmutos_get_covenant, atzmutos_session_report, atzmutos_audit_query)
Tests: 11/11 passing
Storage: JSON file (no native dependencies)
Chayyot: NESHER (npm) + SHOR (npm) + ARYEH (inline) + PANIM ADAM (inline)
Build: dist/index.js ready
npm publish: NOT performed
GitHub push: NOT performed
```

---

## AFTER ALL 8 STEPS — Manual verifications

Run these from PowerShell before marking Build Pack B complete:

```powershell
cd C:\Users\shimo\OneDrive\Desktop\atzmutos

# Confirm build artifact
Test-Path dist\index.js

# Confirm test suite
npm test

# Confirm MCP server starts and lists tools
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

All seven tool names should appear in the tools/list response.

---

## WHAT'S DEFERRED (not in this pack)

- npm publish to @reshimu/atzmutos — deferred until first live engagement
- GitHub push to github.com/reshimu/atzmutos — deferred
- @reshimu/aryeh npm install + real ARYEH wiring — deferred until ARYEH published
- PANIM ADAM standalone package — deferred
- Claude Code / Cursor MCP config (adding atzmutos to mcp.json) — separate step
- BeiurReport resolution workflow (APPROVED/REJECTED) — v0.2.0
- Session expiry enforcement — v0.2.0
- Multi-agent session linking — v0.2.0
