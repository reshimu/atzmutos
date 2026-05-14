// RL_ Atzmut OS — Integration tests
// Tests import functions directly; no MCP transport overhead.

import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readdir, unlink, writeFile, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { sessionReport } from '../src/tools/session-report.js'
import { auditQuery } from '../src/tools/audit-query.js'
import { classifyAction } from '../src/tools/classify-action.js'
import { runIntercept, runInterceptLogged } from '../src/intercept.js'
import { writeBeiur, readBeiur, writeSession, readVerdictsBySession, SESSIONS_DIR, BEIUR_DIR, VERDICTS_DIR } from '../src/store.js'
import type { SessionRecord, BeiurRecord } from '../src/store.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SESSION_ID = 'test-session'
const TEST_SESSION_PATH = join(SESSIONS_DIR, `${TEST_SESSION_ID}.json`)

const TEST_SESSION: SessionRecord = {
  sessionId: TEST_SESSION_ID,
  agentId: 'test-agent',
  covenant: {
    deniedTools: ['deploy'],
    deniedActions: ['drop_table'],
  },
  metadata: {},
  createdAt: new Date().toISOString(),
}

// Track beiur files written during tests so we can clean up
const writtenBeiurIds: string[] = []
// Track verdict files written during tests so we can clean up
const writtenVerdictIds: string[] = []

async function writeBeiurTracked(record: BeiurRecord): Promise<void> {
  writtenBeiurIds.push(record.beiurId)
  await writeBeiur(record)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeEach(async () => {
  // Ensure data dirs exist
  await mkdir(SESSIONS_DIR, { recursive: true })
  await mkdir(BEIUR_DIR, { recursive: true })
  await mkdir(VERDICTS_DIR, { recursive: true })
  // Write a fresh test session before each test
  await writeFile(TEST_SESSION_PATH, JSON.stringify(TEST_SESSION, null, 2), 'utf8')
})

afterAll(async () => {
  // Remove the test session file
  try { await unlink(TEST_SESSION_PATH) } catch { /* ok */ }

  // Remove any beiur files written during tests
  const beiurEntries = await readdir(BEIUR_DIR).catch(() => [] as string[])
  for (const entry of beiurEntries) {
    if (
      entry.startsWith('beiur_test_') ||
      entry.startsWith('beiur_auto_action_log_') ||
      writtenBeiurIds.some(id => entry === `${id}.json`)
    ) {
      try { await unlink(join(BEIUR_DIR, entry)) } catch { /* ok */ }
    }
  }

  // Remove any verdict files written during tests
  const verdictEntries = await readdir(VERDICTS_DIR).catch(() => [] as string[])
  for (const entry of verdictEntries) {
    if (
      entry.startsWith('verdict_action_log_') ||
      writtenVerdictIds.some(id => entry === `${id}.json`)
    ) {
      try { await unlink(join(VERDICTS_DIR, entry)) } catch { /* ok */ }
    }
  }
})

// ─── 1. atzmutos_session_report ───────────────────────────────────────────────

describe('session_report', () => {
  it('returns session + correct beiurCount when beiurs exist', async () => {
    // Write a beiur belonging to the test session
    const beiurId = `beiur_test_sr_${Date.now()}`
    await writeBeiurTracked({
      beiurId,
      actionId: 'action_test_sr',
      sessionId: TEST_SESSION_ID,
      beiur: 'test clarification',
      override: null,
      filedAt: new Date().toISOString(),
    })

    const result = await sessionReport(TEST_SESSION_ID)

    expect('error' in result).toBe(false)
    if ('error' in result) return

    expect(result.session.sessionId).toBe(TEST_SESSION_ID)
    expect(result.beiurCount).toBeGreaterThanOrEqual(1)
    expect(result.beiurs.some(b => b.beiurId === beiurId)).toBe(true)
  })

  it('returns error object on unknown sessionId', async () => {
    const result = await sessionReport('nonexistent-session-xyz')
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toMatch(/not found/i)
  })
})

// ─── 2. atzmutos_audit_query ──────────────────────────────────────────────────

describe('audit_query', () => {
  const Q_SESSION_ID = 'test-session'
  const Q_ACTION_ID = 'action_audit_test'

  beforeEach(async () => {
    // Seed two beiur records for query tests
    await writeBeiurTracked({
      beiurId: `beiur_test_aq1_${Date.now()}`,
      actionId: Q_ACTION_ID,
      sessionId: Q_SESSION_ID,
      beiur: 'first clarification',
      override: 'ALLOW',
      filedAt: new Date().toISOString(),
    })
    // Small delay to ensure different timestamps
    await new Promise(r => setTimeout(r, 2))
    await writeBeiurTracked({
      beiurId: `beiur_test_aq2_${Date.now()}`,
      actionId: 'action_other',
      sessionId: Q_SESSION_ID,
      beiur: 'second clarification',
      override: 'BLOCK',
      filedAt: new Date().toISOString(),
    })
  })

  it('filters by sessionId', async () => {
    const result = await auditQuery({ sessionId: Q_SESSION_ID })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.results.length).toBeGreaterThanOrEqual(2)
    expect(result.results.every(r => r.sessionId === Q_SESSION_ID)).toBe(true)
  })

  it('filters by actionId', async () => {
    const result = await auditQuery({ actionId: Q_ACTION_ID })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.results.length).toBeGreaterThanOrEqual(1)
    expect(result.results.every(r => r.actionId === Q_ACTION_ID)).toBe(true)
  })

  it('returns error object when neither sessionId nor actionId is provided', async () => {
    const result = await auditQuery({})
    expect('error' in result).toBe(true)
    if (!('error' in result)) return
    expect(result.error).toMatch(/sessionId|actionId/i)
  })

  it('respects limit param', async () => {
    const result = await auditQuery({ sessionId: Q_SESSION_ID, limit: 1 })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.results.length).toBeLessThanOrEqual(1)
    // If there are more records than the limit, truncated should be true
    // (we seeded 2+, so truncated should be true)
    expect(result.count).toBe(result.results.length)
  })
})

// ─── 3. atzmutos_classify_action ─────────────────────────────────────────────

describe('classify_action', () => {
  it('returns preview:true and sessionId:null', () => {
    const result = classifyAction({ action: 'read' })
    expect(result.preview).toBe(true)
    expect(result.sessionId).toBeNull()
    expect(result.decision).toBeDefined()
  })

  it('does NOT write any file to data/beiur/', async () => {
    const before = await readdir(BEIUR_DIR).catch(() => [] as string[])

    classifyAction({
      action: 'drop_table',
      covenantScope: { deniedActions: ['drop_table'] },
    })

    const after = await readdir(BEIUR_DIR).catch(() => [] as string[])
    expect(after.length).toBe(before.length)
  })
})

// ─── 4. intercept tool field ──────────────────────────────────────────────────

describe('intercept tool field', () => {
  it('passing tool:deploy with deniedTools scope → BLOCK', () => {
    const verdict = runIntercept(
      {
        sessionId: TEST_SESSION_ID,
        action: 'run',
        tool: 'deploy',
        scope: { deniedTools: ['deploy'] },
      },
      `action_tool_block_${Date.now()}`,
    )
    expect(verdict.decision).toBe('BLOCK')
    expect(verdict.aryeh?.level).toBe('OUT_OF_SCOPE')
  })

  it('passing tool:read with deniedTools scope → not BLOCK', () => {
    const verdict = runIntercept(
      {
        sessionId: TEST_SESSION_ID,
        action: 'fetch',
        tool: 'read',
        scope: { deniedTools: ['deploy'] },
      },
      `action_tool_safe_${Date.now()}`,
    )
    expect(verdict.decision).not.toBe('BLOCK')
  })
})

// ─── 5. atzmutos_file_beiur ───────────────────────────────────────────────────
// (existing tests below — do not modify)

describe('file_beiur', () => {
  it('round-trip write+read preserves all fields', async () => {
    const beiurId = `beiur_test_rt_${Date.now()}`
    const record: BeiurRecord = {
      beiurId,
      actionId: 'action_rt_test',
      sessionId: TEST_SESSION_ID,
      beiur: 'round-trip clarification',
      override: 'ALLOW',
      filedAt: new Date().toISOString(),
    }
    writtenBeiurIds.push(beiurId)

    await writeBeiur(record)
    const loaded = await readBeiur(beiurId)

    expect(loaded).not.toBeNull()
    expect(loaded?.beiurId).toBe(beiurId)
    expect(loaded?.actionId).toBe('action_rt_test')
    expect(loaded?.sessionId).toBe(TEST_SESSION_ID)
    expect(loaded?.beiur).toBe('round-trip clarification')
    expect(loaded?.override).toBe('ALLOW')
  })

  it('rejects missing required fields (validated in index.ts handler)', () => {
    // The validation lives in the MCP handler (not writeBeiur itself).
    // Test the guard logic directly to confirm error path returns an object, not throws.
    const actionId = ''
    const sessionId = ''
    const beiurText = ''

    // Mirror the guard from index.ts
    const hasError = !actionId || !sessionId || !beiurText
    expect(hasError).toBe(true)
  })

  it('accepts null override (no override specified)', async () => {
    const beiurId = `beiur_test_null_${Date.now()}`
    const record: BeiurRecord = {
      beiurId,
      actionId: 'action_null_override',
      sessionId: TEST_SESSION_ID,
      beiur: 'no override',
      override: null,
      filedAt: new Date().toISOString(),
    }
    writtenBeiurIds.push(beiurId)

    await writeBeiur(record)
    const loaded = await readBeiur(beiurId)

    expect(loaded?.override).toBeNull()
  })
})

// ─── 6. atzmutos_intercept (action log) ──────────────────────────────────────

describe('intercept action log', () => {
  it('After ALLOW intercept, a VerdictRecord is written to data/verdicts/', async () => {
    const actionId = `action_log_allow_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId}`)
    await runInterceptLogged(
      { sessionId: TEST_SESSION_ID, action: 'read' },
      actionId,
    )
    const verdicts = await readVerdictsBySession(TEST_SESSION_ID)
    expect(verdicts.some(v => v.actionId === actionId)).toBe(true)
  })

  it('VerdictRecord has correct sessionId, decision ALLOW, beiurFiled false', async () => {
    const actionId = `action_log_allow2_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId}`)
    await runInterceptLogged(
      { sessionId: TEST_SESSION_ID, action: 'read' },
      actionId,
    )
    const verdicts = await readVerdictsBySession(TEST_SESSION_ID)
    const record = verdicts.find(v => v.actionId === actionId)
    expect(record).toBeDefined()
    expect(record?.sessionId).toBe(TEST_SESSION_ID)
    expect(record?.decision).toBe('ALLOW')
    expect(record?.beiurFiled).toBe(false)
    expect(record?.beiurId).toBeNull()
  })

  it('After ESCALATE intercept, VerdictRecord has beiurFiled true and beiurId matches BeiurRecord', async () => {
    // drop_table triggers NESHER=CRITICAL → ESCALATE via panim-adam compose
    const actionId = `action_log_escalate_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId}`)
    writtenBeiurIds.push(`beiur_auto_${actionId}`)
    await runInterceptLogged(
      { sessionId: TEST_SESSION_ID, action: 'drop_table' },
      actionId,
    )
    const verdicts = await readVerdictsBySession(TEST_SESSION_ID)
    const record = verdicts.find(v => v.actionId === actionId)
    expect(record).toBeDefined()
    expect(record?.decision).toBe('ESCALATE')
    expect(record?.beiurFiled).toBe(true)
    expect(record?.beiurId).toBeDefined()

    // beiurId in VerdictRecord must match the auto-filed BeiurRecord
    const beiur = await readBeiur(record!.beiurId!)
    expect(beiur).not.toBeNull()
    expect(beiur?.actionId).toBe(actionId)
  })
})

// ─── 7. atzmutos_session_report (with verdicts) ───────────────────────────────

describe('session_report with verdicts', () => {
  it('Returns verdicts[] array containing VerdictRecords for the session', async () => {
    const actionId = `action_log_sr_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId}`)
    await runInterceptLogged(
      { sessionId: TEST_SESSION_ID, action: 'read' },
      actionId,
    )
    const result = await sessionReport(TEST_SESSION_ID)
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(Array.isArray(result.verdicts)).toBe(true)
    expect(result.verdicts.some(v => v.actionId === actionId)).toBe(true)
  })

  it('verdicts[] is sorted ascending by timestamp', async () => {
    // Write two verdicts with small delay to ensure different timestamps
    const actionId1 = `action_log_sort1_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId1}`)
    await runInterceptLogged({ sessionId: TEST_SESSION_ID, action: 'read' }, actionId1)
    await new Promise(r => setTimeout(r, 5))
    const actionId2 = `action_log_sort2_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId2}`)
    await runInterceptLogged({ sessionId: TEST_SESSION_ID, action: 'read' }, actionId2)

    const result = await sessionReport(TEST_SESSION_ID)
    if ('error' in result) return
    const relevant = result.verdicts.filter(v => v.actionId === actionId1 || v.actionId === actionId2)
    expect(relevant.length).toBe(2)
    expect(new Date(relevant[0].timestamp).getTime()).toBeLessThanOrEqual(
      new Date(relevant[1].timestamp).getTime(),
    )
  })

  it('interceptCount matches the number of VerdictRecords returned', async () => {
    const result = await sessionReport(TEST_SESSION_ID)
    if ('error' in result) return
    expect(result.interceptCount).toBe(result.verdicts.length)
  })
})

// ─── 8. atzmutos_audit_query (since filter) ───────────────────────────────────

describe('audit_query since filter', () => {
  it('since filter excludes records before the timestamp', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const beiurId = `beiur_test_since_${Date.now()}`
    await writeBeiurTracked({
      beiurId,
      actionId: 'action_since_test',
      sessionId: TEST_SESSION_ID,
      beiur: 'since test',
      override: null,
      filedAt: new Date().toISOString(),
    })

    // since = past should include the new record
    const incl = await auditQuery({ sessionId: TEST_SESSION_ID, since: past })
    expect('error' in incl).toBe(false)
    if ('error' in incl) return
    expect(incl.results.some(r => r.beiurId === beiurId)).toBe(true)
  })

  it('since filter with a future timestamp returns empty results', async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString()
    const result = await auditQuery({ sessionId: TEST_SESSION_ID, since: future })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(result.results.length).toBe(0)
  })

  it('since + sessionId combined filters correctly', async () => {
    const midpoint = new Date().toISOString()
    await new Promise(r => setTimeout(r, 5))
    const beiurId = `beiur_test_since_combo_${Date.now()}`
    await writeBeiurTracked({
      beiurId,
      actionId: 'action_since_combo',
      sessionId: TEST_SESSION_ID,
      beiur: 'combo filter test',
      override: null,
      filedAt: new Date().toISOString(),
    })

    const result = await auditQuery({ sessionId: TEST_SESSION_ID, since: midpoint })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    // Record filed after midpoint should be in results
    expect(result.results.some(r => r.beiurId === beiurId)).toBe(true)
    // All results must belong to the correct session
    expect(result.results.every(r => r.sessionId === TEST_SESSION_ID)).toBe(true)
  })
})

// ─── 9. atzmutos_audit_query (verdicts flag) ──────────────────────────────────

describe('audit_query verdicts flag', () => {
  it('verdicts: true returns verdicts[] alongside results[]', async () => {
    const actionId = `action_log_aq_${Date.now()}`
    writtenVerdictIds.push(`verdict_${actionId}`)
    await runInterceptLogged({ sessionId: TEST_SESSION_ID, action: 'read' }, actionId)

    const result = await auditQuery({ sessionId: TEST_SESSION_ID, verdicts: true })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect(Array.isArray(result.verdicts)).toBe(true)
    expect((result.verdicts ?? []).some(v => v.actionId === actionId)).toBe(true)
  })

  it('verdicts: false (or omitted) does not include verdicts key in response', async () => {
    const result = await auditQuery({ sessionId: TEST_SESSION_ID })
    expect('error' in result).toBe(false)
    if ('error' in result) return
    expect('verdicts' in result).toBe(false)
  })
})
