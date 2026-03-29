import type {
  AgentMemoryRecord,
  AgentPolicyVersionRecord,
  AgentRunRecord
} from '../../../shared/archiveContracts'
import { createAgentMemoryService } from '../agentMemoryService'
import { createAgentPolicyService } from '../agentPolicyService'
import { listAgentRuns } from '../agentPersistenceService'
import type { AgentAdapter } from './agentTypes'

type GovernanceAgentDependencies = {
  recordMemory?: (input: {
    role: 'governance'
    memoryKey: string
    memoryValue: string
  }) => AgentMemoryRecord
  listRuns?: (input?: { status?: 'failed' }) => AgentRunRecord[]
  proposePolicyVersion?: (input: {
    role: 'governance'
    policyKey: string
    policyBody: string
  }) => AgentPolicyVersionRecord
}

function parseSuffix(prompt: string, prefix: RegExp, fallbackMessage: string) {
  const match = prompt.match(prefix)
  if (!match?.[1]) {
    throw new Error(fallbackMessage)
  }

  return match[1].trim()
}

export function createGovernanceAgentService(
  dependencies: GovernanceAgentDependencies = {}
): AgentAdapter {
  return {
    role: 'governance',
    canHandle(taskKind) {
      return [
        'governance.record_feedback',
        'governance.summarize_failures',
        'governance.propose_policy_update'
      ].includes(taskKind)
    },
    async execute(context) {
      const recordMemory = dependencies.recordMemory ?? createAgentMemoryService({ db: context.db }).recordMemory
      const getRuns = dependencies.listRuns ?? ((input) => listAgentRuns(context.db, input))
      const proposePolicyVersion = dependencies.proposePolicyVersion ?? createAgentPolicyService({ db: context.db }).proposePolicyVersion

      switch (context.taskKind) {
        case 'governance.record_feedback': {
          const memoryValue = parseSuffix(
            context.input.prompt,
            /record feedback:\s*(.+)$/i,
            'Missing governance feedback in prompt'
          )
          const record = recordMemory({
            role: 'governance',
            memoryKey: 'governance.feedback',
            memoryValue
          })

          return {
            messages: [
              {
                sender: 'tool',
                content: `Recorded governance feedback as ${record.memoryId}.`
              },
              {
                sender: 'agent',
                content: `Operational feedback captured in memory ${record.memoryId}.`
              }
            ]
          }
        }
        case 'governance.summarize_failures': {
          const failedRuns = getRuns({ status: 'failed' })

          return {
            messages: [
              {
                sender: 'tool',
                content: `Loaded ${failedRuns.length} failed runs for governance review.`
              },
              {
                sender: 'agent',
                content: `${failedRuns.length} failed runs need review.`
              }
            ]
          }
        }
        case 'governance.propose_policy_update': {
          const policyBody = parseSuffix(
            context.input.prompt,
            /propose policy update:\s*(.+)$/i,
            'Missing policy proposal in prompt'
          )
          const proposal = proposePolicyVersion({
            role: 'governance',
            policyKey: 'governance.review.policy',
            policyBody
          })

          return {
            messages: [
              {
                sender: 'tool',
                content: `Drafted governance policy version ${proposal.policyVersionId}.`
              },
              {
                sender: 'agent',
                content: `Policy proposal ${proposal.policyVersionId} created for review without activation.`
              }
            ]
          }
        }
      }

      throw new Error(`Unsupported governance task kind: ${context.taskKind}`)
    }
  }
}
