import { readIntercepts, readBeiurs } from '../storage/index.js'
import type { InterceptEvent, BeiurReport } from '../storage/schema.js'

export interface AuditQueryInput {
  sessionId?: string
  decision?: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  tool?: string
  since?: string
  until?: string
  limit?: number
}

export interface AuditQueryOutput {
  total: number
  events: InterceptEvent[]
  beiurReports: BeiurReport[]
}

export async function auditQuery(input: AuditQueryInput): Promise<AuditQueryOutput> {
  const effectiveLimit = Math.min(input.limit ?? 100, 500)

  let events = readIntercepts().events

  if (input.sessionId !== undefined) {
    events = events.filter((e) => e.sessionId === input.sessionId)
  }
  if (input.decision !== undefined) {
    events = events.filter((e) => e.decision === input.decision)
  }
  if (input.tool !== undefined) {
    events = events.filter((e) => e.proposedAction.tool === input.tool)
  }
  if (input.since !== undefined) {
    events = events.filter((e) => e.timestamp >= input.since!)
  }
  if (input.until !== undefined) {
    events = events.filter((e) => e.timestamp <= input.until!)
  }

  events = events.slice(0, effectiveLimit)

  const eventIds = new Set(events.map((e) => e.eventId))
  const beiurReports = readBeiurs().reports.filter((r) => eventIds.has(r.eventId))

  return { total: events.length, events, beiurReports }
}
