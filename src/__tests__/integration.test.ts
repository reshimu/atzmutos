import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import * as os from 'node:os'
import * as path from 'node:path'
import * as fs from 'node:fs'

// Set data dir before importing storage-dependent modules
const TEST_DATA_DIR = path.join(os.tmpdir(), `atzmutos-test-${Date.now()}`)
process.env['ATZMUTOS_DATA_DIR'] = TEST_DATA_DIR

import { registerSession } from '../tools/register-session.js'
import { getCovenant } from '../tools/get-covenant.js'
import { classifyAction } from '../tools/classify-action.js'
import { intercept } from '../tools/intercept.js'
import { fileBeiur } from '../tools/file-beiur.js'
import { sessionReport } from '../tools/session-report.js'
import { auditQuery } from '../tools/audit-query.js'

afterAll(() => {
  try { fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true }) } catch {}
})

let sessionIdFromTest1: string

// 1. registerSession
it('1. registerSession creates a covenant and persists it', async () => {
  const result = await registerSession({
    agentId: 'test-agent',
    intent: 'send weekly digest emails',
    authorizedTools: ['send_email', 'read_calendar'],
    authorizedScope: ['email:outbound', 'calendar:read'],
  })
  expect(result.sessionId).toMatch(/^ses_/)
  expect(result.covenant.intent).toBe('send weekly digest emails')
  expect(result.alreadyExists).toBe(false)
  sessionIdFromTest1 = result.sessionId
})

// 2. getCovenant
it('2. getCovenant retrieves the session', async () => {
  const result = await getCovenant({ sessionId: sessionIdFromTest1 })
  expect(result.found).toBe(true)
  expect(result.expired).toBe(false)
  expect(result.covenant?.agentId).toBe('test-agent')
})

// 3. classifyAction PASS case
it('3. classifyAction returns PASS or PASS_WITH_LOG for read_calendar', async () => {
  const result = await classifyAction({ tool: 'read_calendar', input: { date: 'today' } })
  expect(['PASS', 'PASS_WITH_LOG']).toContain(result.decision)
})

// 4. intercept PASS case
it('4. intercept returns PASS/PASS_WITH_LOG for authorized tool', async () => {
  const result = await intercept({
    sessionId: sessionIdFromTest1,
    tool: 'read_calendar',
    input: { date: 'today' },
    outputSummary: 'Meeting at 2pm in Room B',
    sources: ['Calendar: 2pm Room B sync'],
  })
  expect(['PASS', 'PASS_WITH_LOG']).toContain(result.decision)
  expect(result.eventId).toMatch(/^evt_/)
})

// 5. intercept BLOCK case (tool not in authorizedTools)
it('5. intercept returns BLOCK for unauthorized tool', async () => {
  const result = await intercept({
    sessionId: sessionIdFromTest1,
    tool: 'delete_all_records',
    input: { confirm: true },
  })
  expect(result.decision).toBe('BLOCK')
})

// 6. intercept ESCALATE case (gray zone trigger: uncertainty language)
it('6. intercept returns ESCALATE for uncertain outputSummary', async () => {
  const result = await intercept({
    sessionId: sessionIdFromTest1,
    tool: 'send_email',
    input: { to: 'all@company.com' },
    outputSummary: 'I am not sure this is the right list',
    sources: ['Contact list exported'],
  })
  expect(result.decision).toBe('ESCALATE')
  expect(result.beiurReportId).toMatch(/^beiur_/)
})

// 7. fileBeiur manual escalation
it('7. fileBeiur creates a PENDING report', async () => {
  const result = await fileBeiur({
    sessionId: sessionIdFromTest1,
    tool: 'send_email',
    input: { to: 'ceo@company.com' },
    reason: 'Unsolicited contact with executive',
  })
  expect(result.status).toBe('PENDING')
  expect(result.reportId).toMatch(/^beiur_/)
})

// 8. sessionReport aggregates correctly
it('8. sessionReport aggregates correctly after prior tests', async () => {
  const result = await sessionReport({ sessionId: sessionIdFromTest1 })
  expect(result.summary.totalIntercepts).toBeGreaterThanOrEqual(3)
  expect(result.summary.blocked).toBeGreaterThanOrEqual(1)
  expect(result.summary.escalated).toBeGreaterThanOrEqual(1)
  expect(result.beiurReports.length).toBeGreaterThanOrEqual(1)
})

// 9. auditQuery filter by decision
it('9. auditQuery filter by BLOCK returns only BLOCK events', async () => {
  const result = await auditQuery({ decision: 'BLOCK' })
  expect(result.events.every((e) => e.decision === 'BLOCK')).toBe(true)
})

// 10. auditQuery filter by tool
it('10. auditQuery filter by tool returns only matching events', async () => {
  const result = await auditQuery({ tool: 'send_email' })
  expect(result.events.every((e) => e.proposedAction.tool === 'send_email')).toBe(true)
})

// 11. intercept session not found
it('11. intercept returns BLOCK with SESSION_NOT_FOUND for unknown session', async () => {
  const result = await intercept({
    sessionId: 'ses_doesnotexist',
    tool: 'any_tool',
    input: {},
  })
  expect(result.decision).toBe('BLOCK')
  expect(result.sessionError).toBe('SESSION_NOT_FOUND')
})
