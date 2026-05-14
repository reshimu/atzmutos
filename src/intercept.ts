// PANIM ADAM composition: NESHER + SHOR + ARYEH → ChayyotVerdict.
// All three classifiers are synchronous. No I/O, no model calls.

import { classify as nesherClassify } from '@reshimu/nesher'
import { classify as shorClassify } from '@reshimu/shor'
import { classify as aryehClassify } from '@reshimu/aryeh'
import { compose } from '@reshimu/panim-adam'
import type { ScopeDefinition, StructuredAction } from '@reshimu/aryeh'
import type { ChayyotVerdict } from './types/chayyot-verdict.js'
import { writeVerdict, writeBeiur } from './store.js'
import type { VerdictRecord, BeiurRecord } from './store.js'

export interface InterceptInput {
  sessionId: string
  action: string
  tool?: string
  target?: string
  output?: string
  context?: string
  environment?: string
  scope?: ScopeDefinition
  metadata?: Record<string, unknown>
}

export function runIntercept(input: InterceptInput, actionId: string): ChayyotVerdict {
  // ── NESHER — irreversibility risk ──────────────────────────────────────────
  const nesher = nesherClassify({
    action: input.action,
    target: input.target,
    context: {
      environment: input.environment,
      ...(input.metadata ?? {}),
    },
  })

  // ── SHOR — grounding / anti-hallucination (skipped if no output+context) ──
  const shor =
    input.output !== undefined && input.context !== undefined
      ? shorClassify({ output: input.output, context: input.context })
      : null

  // ── ARYEH — scope/boundary enforcement (skipped if no covenant) ────────────
  // DECISION: When tool is provided, wrap as StructuredAction so ARYEH can
  // evaluate deniedTools. A plain string action is only extracted as a verb,
  // so tool-based denials would be silently skipped without this branch.
  let aryeh = null
  if (input.scope !== undefined) {
    const aryehAction: string | StructuredAction =
      input.tool !== undefined
        ? { tool: input.tool, verb: input.action }
        : input.action
    aryeh = aryehClassify({ action: aryehAction, scope: input.scope })
  }

  // ── PANIM ADAM — gray-zone composition ────────────────────────────────────
  const panimAdam = compose(
    { nesher, shor, aryeh },
    input.action,
    input.context,
  )

  return {
    decision: panimAdam.decision,
    sessionId: input.sessionId,
    actionId,
    timestamp: new Date().toISOString(),
    nesher,
    shor,
    aryeh,
    panimAdam,
    summary: buildSummary(nesher.level, shor?.level ?? null, aryeh?.level ?? null, panimAdam.decision),
  }
}

// # DECISION: runIntercept remains synchronous to preserve the existing synchronous
// test surface (the intercept tool field tests call it without await). All disk I/O
// is handled by runInterceptLogged, an async wrapper used by the MCP handler and
// new integration tests. The wrapper writes the Beiur first (for ESCALATE) so that
// beiurId is available when the VerdictRecord is constructed — the verdict is always
// written after any Beiur, never before.
export async function runInterceptLogged(
  input: InterceptInput,
  actionId: string,
): Promise<ChayyotVerdict> {
  const verdict = runIntercept(input, actionId)

  let beiurFiled = false
  let beiurId: string | null = null

  if (verdict.decision === 'ESCALATE' && verdict.panimAdam.beiur !== null) {
    beiurId = `beiur_auto_${actionId}`
    const beiurRecord: BeiurRecord = {
      beiurId,
      actionId,
      sessionId: input.sessionId,
      beiur: verdict.panimAdam.beiur.summary,
      override: null,
      filedAt: verdict.timestamp,
    }
    await writeBeiur(beiurRecord)
    beiurFiled = true
  }

  const verdictRecord: VerdictRecord = {
    verdictId: `verdict_${actionId}`,
    sessionId: input.sessionId,
    actionId,
    action: input.action,
    decision: verdict.decision,
    reasoning: verdict.panimAdam.reasoning,
    reasons: verdict.panimAdam.reasons,
    nesherLevel: verdict.nesher.level,
    shorLevel: verdict.shor?.level ?? null,
    aryehLevel: verdict.aryeh?.level ?? null,
    beiurFiled,
    beiurId,
    timestamp: verdict.timestamp,
  }
  await writeVerdict(verdictRecord)

  return verdict
}

function buildSummary(
  nesher: string,
  shor: string | null,
  aryeh: string | null,
  decision: string,
): string {
  const parts = [`NESHER=${nesher}`]
  if (shor !== null) parts.push(`SHOR=${shor}`)
  if (aryeh !== null) parts.push(`ARYEH=${aryeh}`)
  return `[${decision}] ${parts.join(' · ')}`
}
