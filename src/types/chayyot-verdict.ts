import type { ClassificationResult as NesherResult } from '@reshimu/nesher'
import type { ClassifyResult as ShorResult } from '@reshimu/shor'
import type { ClassifyResult as AryehResult } from '@reshimu/aryeh'

export type { PanimAdamResult, BeiurReport, PanimAdamDecision } from '@reshimu/panim-adam'

export type ChayyotVerdictDecision =
  | 'ALLOW'
  | 'CAUTION'
  | 'BLOCK'
  | 'ESCALATE'
  | 'INDETERMINATE'

export interface ChayyotVerdict {
  decision: ChayyotVerdictDecision
  sessionId: string
  actionId: string
  timestamp: string
  nesher: NesherResult
  shor: ShorResult | null
  aryeh: AryehResult | null
  panimAdam: import('@reshimu/panim-adam').PanimAdamResult
  summary: string
}
