// DECISION: classify_action is explicitly stateless (preview mode). No session
// write, no Beiur filed, sessionId is always null in the return. This makes it
// safe to call from UI preview flows without polluting the audit log.

import { classify as nesherClassify } from '@reshimu/nesher'
import { classify as shorClassify } from '@reshimu/shor'
import { classify as aryehClassify } from '@reshimu/aryeh'
import { compose } from '@reshimu/panim-adam'
import type { ScopeDefinition, StructuredAction } from '@reshimu/aryeh'
import type { ChayyotVerdict } from '../types/chayyot-verdict.js'

export interface ClassifyActionInput {
  action: string
  tool?: string
  output?: string
  context?: string
  covenantScope?: ScopeDefinition
}

export type ClassifyActionResult = Omit<ChayyotVerdict, 'sessionId'> & {
  preview: true
  sessionId: null
}

export function classifyAction(input: ClassifyActionInput): ClassifyActionResult {
  // ── NESHER — irreversibility risk ───────────────────────────────────────────
  const nesher = nesherClassify({ action: input.action })

  // ── SHOR — grounding check (only if output + context provided) ──────────────
  const shor =
    input.output !== undefined && input.context !== undefined
      ? shorClassify({ output: input.output, context: input.context })
      : null

  // ── ARYEH — scope check (only if covenantScope provided) ────────────────────
  let aryeh = null
  if (input.covenantScope !== undefined) {
    // If tool is provided, use StructuredAction so deniedTools is evaluated
    const aryehAction: string | StructuredAction =
      input.tool !== undefined
        ? { tool: input.tool, verb: input.action }
        : input.action
    aryeh = aryehClassify({ action: aryehAction, scope: input.covenantScope })
  }

  // ── PANIM ADAM composition ───────────────────────────────────────────────────
  const panimAdam = compose(
    { nesher, shor, aryeh },
    input.action,
    input.context,
  )
  const summary = buildSummary(nesher.level, shor?.level ?? null, aryeh?.level ?? null, panimAdam.decision)

  return {
    decision: panimAdam.decision,
    sessionId: null,
    actionId: `preview_${Date.now()}`,
    timestamp: new Date().toISOString(),
    nesher,
    shor,
    aryeh,
    panimAdam,
    summary,
    preview: true,
  }
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
