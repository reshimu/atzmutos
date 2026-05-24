import { appendBeiur } from '../storage/index.js'
import type { BeiurReport } from '../storage/schema.js'
import { reportId as genReportId } from '../utils/ids.js'
import { now } from '../utils/time.js'

export interface FileBeiurInput {
  sessionId: string
  tool: string
  input: Record<string, unknown>
  reason: string
  eventId?: string
}

export interface FileBeiurOutput {
  reportId: string
  filedAt: string
  status: 'PENDING'
}

export async function fileBeiur(input: FileBeiurInput): Promise<FileBeiurOutput> {
  const report: BeiurReport = {
    reportId: genReportId(),
    sessionId: input.sessionId,
    eventId: input.eventId ?? '',
    filedAt: now(),
    status: 'PENDING',
    panimAdamReason: input.reason,
    proposedAction: { tool: input.tool, input: input.input },
  }
  appendBeiur(report)
  return { reportId: report.reportId, filedAt: report.filedAt, status: 'PENDING' }
}
