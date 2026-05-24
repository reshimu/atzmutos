import { classify as nesherClassify } from '@reshimu/nesher'
import { classify as shorClassify } from '@reshimu/shor'

export interface ValidatorInput {
  tool: string
  input: Record<string, unknown>
  outputSummary?: string
  sources?: string[]
  authorizedTools: string[]
  authorizedScope: string[]
}

export interface ValidatorResults {
  nesher: { level: string; irreversible: boolean; escalate: boolean }
  shor: { level: string; score: number; unmatched: string[] }
  aryeh: { level: string; inScope: boolean; reason: string }
  panimAdam: { level: string; isGrayZone: boolean; reason: string }
  decision: 'PASS' | 'PASS_WITH_LOG' | 'BLOCK' | 'ESCALATE'
  decisionReason: string
}

function runAryeh(
  tool: string,
  input: Record<string, unknown>,
  authorizedTools: string[],
  authorizedScope: string[],
): { level: string; inScope: boolean; reason: string } {
  const toolAllowed = authorizedTools.includes('*') || authorizedTools.includes(tool)
  if (!toolAllowed) {
    return { level: 'BLOCK', inScope: false, reason: `tool ${tool} not in authorized set` }
  }
  const inputStr = JSON.stringify(input)
  const scopeMatched =
    authorizedScope.includes('*') ||
    authorizedScope.some((tag) => inputStr.includes(tag))
  if (!scopeMatched) {
    return { level: 'PASS_WITH_LOG', inScope: true, reason: 'scope tag not matched but tool authorized' }
  }
  return { level: 'PASS', inScope: true, reason: 'authorized' }
}

function runPanimAdam(
  nesherLevel: string,
  shorLevel: string,
  tool: string,
  outputSummary?: string,
): { level: string; isGrayZone: boolean; reason: string } {
  if (shorLevel === 'PARTIAL') {
    return { level: 'ESCALATE', isGrayZone: true, reason: 'SHOR grounding is only partial' }
  }
  if (nesherLevel === 'CAUTION') {
    return { level: 'ESCALATE', isGrayZone: true, reason: 'NESHER flagged CAUTION' }
  }
  const toolLower = tool.toLowerCase()
  if (
    (toolLower.includes('delete') || toolLower.includes('remove') || toolLower.includes('send')) &&
    nesherLevel !== 'CRITICAL'
  ) {
    return { level: 'ESCALATE', isGrayZone: true, reason: `tool name contains sensitive verb: ${tool}` }
  }
  if (outputSummary !== undefined) {
    const lower = outputSummary.toLowerCase()
    if (lower.includes('not sure') || lower.includes('unclear') || lower.includes('approximate')) {
      return { level: 'ESCALATE', isGrayZone: true, reason: 'outputSummary contains uncertainty language' }
    }
  }
  return { level: 'PASS', isGrayZone: false, reason: 'no gray zone indicators' }
}

export async function runChayyot(input: ValidatorInput): Promise<ValidatorResults> {
  // NESHER
  const nesherRaw = nesherClassify({ action: input.tool, target: JSON.stringify(input.input) })
  const nesher = {
    level: nesherRaw.level as string,
    irreversible: nesherRaw.irreversible,
    escalate: nesherRaw.escalate,
  }

  // SHOR — join sources as context string
  let shor: { level: string; score: number; unmatched: string[] }
  if (input.outputSummary !== undefined && (input.sources?.length ?? 0) > 0) {
    const shorRaw = shorClassify({
      output: input.outputSummary,
      context: input.sources!.join('\n'),
    })
    const unmatched = shorRaw.entities
      .filter((e) => !e.found)
      .map((e) => e.text)
    shor = {
      level: shorRaw.level as string,
      score: shorRaw.score,
      unmatched,
    }
  } else {
    shor = { level: 'INDETERMINATE', score: 0, unmatched: [] }
  }

  // ARYEH (inline)
  const aryeh = runAryeh(input.tool, input.input, input.authorizedTools, input.authorizedScope)

  // PANIM ADAM (inline)
  const panimAdam = runPanimAdam(nesher.level, shor.level, input.tool, input.outputSummary)

  // Decision — first match wins
  let decision: ValidatorResults['decision']
  let decisionReason: string

  if (nesher.level === 'CRITICAL' || nesher.level === 'BLOCKED') {
    decision = 'BLOCK'
    decisionReason = 'irreversible action blocked by NESHER'
  } else if (shor.level === 'UNGROUNDED') {
    decision = 'BLOCK'
    decisionReason = 'ungrounded output blocked by SHOR'
  } else if (aryeh.level === 'BLOCK') {
    decision = 'BLOCK'
    decisionReason = aryeh.reason
  } else if (panimAdam.isGrayZone) {
    decision = 'ESCALATE'
    decisionReason = panimAdam.reason
  } else if (nesher.level === 'CAUTION' || shor.level === 'PARTIAL' || aryeh.level === 'PASS_WITH_LOG') {
    decision = 'PASS_WITH_LOG'
    decisionReason = 'non-critical flags present'
  } else {
    decision = 'PASS'
    decisionReason = 'all Chayyot clear'
  }

  return { nesher, shor, aryeh, panimAdam, decision, decisionReason }
}
