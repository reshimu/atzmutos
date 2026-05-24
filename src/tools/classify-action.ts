import { runChayyot } from '../validators/index.js'
import type { ValidatorResults } from '../validators/index.js'

export interface ClassifyActionInput {
  tool: string
  input: Record<string, unknown>
  outputSummary?: string
  sources?: string[]
}

export async function classifyAction(input: ClassifyActionInput): Promise<ValidatorResults> {
  return runChayyot({
    tool: input.tool,
    input: input.input,
    outputSummary: input.outputSummary,
    sources: input.sources,
    authorizedTools: ['*'],
    authorizedScope: ['*'],
  })
}
