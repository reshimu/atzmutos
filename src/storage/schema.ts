export interface Covenant {
  sessionId: string
  agentId: string
  intent: string
  authorizedTools: string[]
  authorizedScope: string[]
  createdAt: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface InterceptEvent {
  eventId: string
  sessionId: string
  timestamp: string
  proposedAction: {
    tool: string
    input: Record<string, unknown>
    outputSummary?: string
    sources?: string[]
  }
  chayyotResults: {
    nesher: { level: string; irreversible: boolean; escalate: boolean }
    shor: { level: string; score: number; unmatched: string[] }
    aryeh: { level: string; inScope: boolean; reason: string }
    panimAdam: { level: string; isGrayZone: boolean; reason: string }
  }
  decision: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  decisionReason: string
  beiurReportId?: string
}

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

export interface SessionStore {
  sessions: Record<string, Covenant>
}

export interface InterceptStore {
  events: InterceptEvent[]
}

export interface BeiurStore {
  reports: BeiurReport[]
}
