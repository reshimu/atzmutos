import { getSession, getInterceptsBySession, getBeiursBySession } from '../storage/index.js'
import type { Covenant, InterceptEvent, BeiurReport } from '../storage/schema.js'

export interface SessionReportInput {
  sessionId: string
}

export interface SessionReportOutput {
  sessionId: string
  covenant: Covenant | null
  summary: {
    totalIntercepts: number
    passed: number
    passedWithLog: number
    blocked: number
    escalated: number
    beiurReportsFiled: number
    beiursPending: number
  }
  events: InterceptEvent[]
  beiurReports: BeiurReport[]
}

export async function sessionReport(input: SessionReportInput): Promise<SessionReportOutput> {
  const covenant = getSession(input.sessionId)
  const events = getInterceptsBySession(input.sessionId)
  const beiurReports = getBeiursBySession(input.sessionId)

  const summary = {
    totalIntercepts: events.length,
    passed: events.filter((e) => e.decision === 'PASS').length,
    passedWithLog: events.filter((e) => e.decision === 'PASS_WITH_LOG').length,
    blocked: events.filter((e) => e.decision === 'BLOCK').length,
    escalated: events.filter((e) => e.decision === 'ESCALATE').length,
    beiurReportsFiled: beiurReports.length,
    beiursPending: beiurReports.filter((r) => r.status === 'PENDING').length,
  }

  return { sessionId: input.sessionId, covenant, summary, events, beiurReports }
}
