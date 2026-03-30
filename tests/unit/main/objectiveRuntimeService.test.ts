import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { openDatabase, runMigrations } from '../../../src/main/services/db'
import { createFacilitatorAgentService } from '../../../src/main/services/agents/facilitatorAgentService'
import { createExternalVerificationBrokerService } from '../../../src/main/services/externalVerificationBrokerService'
import { createObjectiveRuntimeService } from '../../../src/main/services/objectiveRuntimeService'
import { createSubagentRegistryService } from '../../../src/main/services/subagentRegistryService'

function setupDatabase() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forgetme-objective-runtime-flow-'))
  const db = openDatabase(path.join(root, 'archive.sqlite'))
  runMigrations(db)
  return db
}

describe('objective runtime service', () => {
  it('lets review raise a blocking challenge and governance veto a proposal', async () => {
    const db = setupDatabase()
    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => []
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Decide whether approval is safe',
      objectiveKind: 'review_decision',
      prompt: 'Review the candidate and decide whether approval is safe.',
      initiatedBy: 'operator'
    })

    const reviewProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-1' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    const challenged = runtime.raiseBlockingChallenge({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposalId: reviewProposal.proposalId,
      fromParticipantId: 'review',
      body: 'We still need external verification before approval.'
    })

    const vetoed = runtime.vetoProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposalId: reviewProposal.proposalId,
      rationale: 'Governance blocks approval until evidence is verified.'
    })

    expect(challenged.status).toBe('challenged')
    expect(vetoed.status).toBe('vetoed')

    db.close()
  })

  it('lets workspace request external verification and emits key checkpoints', async () => {
    const db = setupDatabase()
    const runtime = createObjectiveRuntimeService({
      db,
      facilitator: createFacilitatorAgentService(),
      externalVerificationBroker: createExternalVerificationBrokerService({
        searchWeb: async () => [
          {
            title: 'Example announcement',
            url: 'https://example.com',
            publishedAt: '2026-03-30T00:00:00.000Z',
            extractedFact: 'The announcement date is March 30, 2026.',
            reliabilityLabel: 'official'
          }
        ]
      }),
      subagentRegistry: createSubagentRegistryService()
    })

    const started = runtime.startObjective({
      title: 'Verify an external claim before responding',
      objectiveKind: 'evidence_investigation',
      prompt: 'Check the external source before we answer the user.',
      initiatedBy: 'operator'
    })

    const verification = await runtime.requestExternalVerification({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'workspace',
      claim: 'The source confirms the announcement date.',
      query: 'official announcement date'
    })

    const reviewProposal = runtime.createProposal({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposedByParticipantId: 'review',
      proposalKind: 'approve_review_item',
      payload: { queueItemId: 'rq-2' },
      ownerRole: 'review',
      requiresOperatorConfirmation: true
    })

    const latestProposal = runtime.approveProposalAsOwner({
      objectiveId: started.objective.objectiveId,
      threadId: started.mainThread.threadId,
      proposalId: reviewProposal.proposalId
    })
    const detail = runtime.getObjectiveDetail({
      objectiveId: started.objective.objectiveId
    })

    expect(verification.citationBundle.verdict).toBe('supported')
    expect(verification.citationBundle.sources[0]?.url).toBe('https://example.com')
    expect(detail?.checkpoints.map((checkpoint) => checkpoint.checkpointKind)).toEqual(
      expect.arrayContaining([
        'goal_accepted',
        'participants_invited',
        'proposal_raised',
        'subagent_spawned',
        'external_verification_completed',
        'awaiting_operator_confirmation'
      ])
    )
    expect(latestProposal.status).toBe('awaiting_operator')

    db.close()
  })
})
