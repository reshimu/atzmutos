import { getSession, appendIntercept, appendBeiur } from '../storage/index.js'
import { isExpired, now } from '../utils/time.js'
import { runChayyot } from '../validators/index.js'
import { eventId as genEventId, reportId as genReportId } from '../utils/ids.js'
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
  sessionError?: string
}

const zeroChayyot: InterceptEvent['chayyotResults'] = {
  nesher: { level: 'PASS', irreversible: false, escalate: false },
  shor: { level: 'INDETERMINATE', score: 0, unmatched: [] },
  aryeh: { level: 'PASS', inScope: true, reason: 'no-session' },
  panimAdam: { level: 'PASS', isGrayZone: false, reason: 'no-session' },
}

export async function intercept(input: InterceptInput): Promise<InterceptOutput> {
  const covenant = getSession(input.sessionId)

  if (!covenant) {
    return {
      eventId: '',
      sessionId: input.sessionId,
      decision: 'BLOCK',
      decisionReason: 'session not found',
      chayyotResults: zeroChayyot,
      sessionError: 'SESSION_NOT_FOUND',
    }
  }

  if (isExpired(covenant.expiresAt)) {
    return {
      eventId: '',
      sessionId: input.sessionId,
      decision: 'BLOCK',
      decisionReason: 'session expired',
      chayyotResults: zeroChayyot,
      sessionError: 'SESSION_EXPIRED',
    }
  }

  const results = await runChayyot({
    tool: input.tool,
    input: input.input,
    outputSummary: input.outputSummary,
    sources: input.sources,
    authorizedTools: covenant.authorizedTools,
    authorizedScope: covenant.authorizedScope,
  })

  const eid = genEventId()
  const timestamp = now()

  const event: InterceptEvent = {
    eventId: eid,
    sessionId: input.sessionId,
    timestamp,
    proposedAction: {
      tool: input.tool,
      input: input.input,
      outputSummary: input.outputSummary,
      sources: input.sources,
    },
    chayyotResults: {
      nesher: results.nesher,
      shor: results.shor,
      aryeh: results.aryeh,
      panimAdam: results.panimAdam,
    },
    decision: results.decision,
    decisionReason: results.decisionReason,
  }

  let beiurReportId: string | undefined

  if (results.decision === 'ESCALATE') {
    beiurReportId = genReportId()
    const report: BeiurReport = {
      reportId: beiurReportId,
      sessionId: input.sessionId,
      eventId: eid,
      filedAt: timestamp,
      status: 'PENDING',
      panimAdamReason: results.panimAdam.reason,
      proposedAction: { tool: input.tool, input: input.input },
    }
    appendBeiur(report)
    event.beiurReportId = beiurReportId
  }

  appendIntercept(event)

  return {
    eventId: eid,
    sessionId: input.sessionId,
    decision: results.decision,
    decisionReason: results.decisionReason,
    chayyotResults: event.chayyotResults,
    beiurReportId,
  }
}
