import { describe, expect, it } from 'vitest'
import type { RunAgentTaskInput } from '../../../src/shared/archiveContracts'
import { previewAgentExecution } from '../../../src/main/services/agentOrchestratorService'

describe('agent orchestrator service', () => {
  it('previews destructive review item decisions with confirmation requirements', () => {
    const preview = previewAgentExecution({
      prompt: 'Approve review item rq-1',
      role: 'orchestrator'
    } as RunAgentTaskInput)

    expect(preview).toEqual({
      taskKind: 'review.apply_item_decision',
      targetRole: 'review',
      assignedRoles: ['orchestrator', 'review'],
      requiresConfirmation: true
    })
  })

  it('routes ingestion, workspace, and governance prompts predictably', () => {
    expect(previewAgentExecution({
      prompt: 'Import these files into the archive',
      role: 'orchestrator'
    })).toEqual({
      taskKind: 'ingestion.import_batch',
      targetRole: 'ingestion',
      assignedRoles: ['orchestrator', 'ingestion'],
      requiresConfirmation: false
    })

    expect(previewAgentExecution({
      prompt: 'Use the workspace to answer this archive question.',
      role: 'orchestrator'
    })).toEqual({
      taskKind: 'workspace.ask_memory',
      targetRole: 'workspace',
      assignedRoles: ['orchestrator', 'workspace'],
      requiresConfirmation: false
    })

    expect(previewAgentExecution({
      prompt: 'Propose policy update: tighten review safety.',
      role: 'governance',
      taskKind: 'governance.propose_policy_update'
    })).toEqual({
      taskKind: 'governance.propose_policy_update',
      targetRole: 'governance',
      assignedRoles: ['governance'],
      requiresConfirmation: false
    })
  })
})
