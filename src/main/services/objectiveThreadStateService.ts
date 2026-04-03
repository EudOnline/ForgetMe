import type {
  AgentCheckpointKind,
  AgentCheckpointRecord,
  AgentMessageRecordV2,
  AgentObjectiveRecord,
  AgentProposalRecord,
  AgentThreadRecord,
  AgentVoteRecord
} from '../../shared/archiveContracts'
import type { VerificationVerdict } from '../../shared/contracts/verification'

export type ObjectiveThreadState =
  | 'exploring'
  | 'waiting_for_external_evidence'
  | 'conflict_unresolved'
  | 'awaiting_governance'
  | 'awaiting_operator'
  | 'ready_to_converge'
  | 'stalled'
  | 'completed'

export type ObjectiveThreadStateResult = {
  state: ObjectiveThreadState
  verificationVerdict: VerificationVerdict | null
  hasUserFacingResult: boolean
}

type ThreadStateInput = {
  objective: Pick<AgentObjectiveRecord, 'status' | 'requiresOperatorInput'>
  thread: Pick<AgentThreadRecord, 'status'> & {
    proposals: Array<Pick<AgentProposalRecord, 'proposalKind' | 'status'>>
    votes: Array<Pick<AgentVoteRecord, 'voterRole' | 'vote'>>
    checkpoints: Array<Pick<AgentCheckpointRecord, 'checkpointKind' | 'summary'>>
    messages: Array<Pick<AgentMessageRecordV2, 'kind' | 'fromParticipantId' | 'blocking'>>
  }
  roundsWithoutProgress: number
  hasNewArtifacts: boolean
}

function isActiveProposal(status: AgentProposalRecord['status']) {
  return [
    'open',
    'under_review',
    'challenged',
    'approved',
    'committable'
  ].includes(status)
}

function extractVerificationVerdict(checkpoints: Array<Pick<AgentCheckpointRecord, 'checkpointKind' | 'summary'>>): VerificationVerdict | null {
  for (const checkpoint of [...checkpoints].reverse()) {
    if (checkpoint.checkpointKind !== 'external_verification_completed') {
      continue
    }

    const verdict = checkpoint.summary.match(/\b(supported|contradicted|mixed|insufficient)\b/i)?.[1]
    if (verdict) {
      return verdict.toLowerCase() as VerificationVerdict
    }
  }

  return null
}

function hasCheckpoint(
  checkpoints: Array<Pick<AgentCheckpointRecord, 'checkpointKind'>>,
  checkpointKind: AgentCheckpointKind
) {
  return checkpoints.some((checkpoint) => checkpoint.checkpointKind === checkpointKind)
}

export function createObjectiveThreadStateService() {
  return {
    classifyThreadState(input: ThreadStateInput): ObjectiveThreadStateResult {
      const proposals = input.thread.proposals ?? []
      const votes = input.thread.votes ?? []
      const checkpoints = input.thread.checkpoints ?? []
      const messages = input.thread.messages ?? []
      const verificationVerdict = extractVerificationVerdict(checkpoints)
      const hasUserFacingResult = (
        hasCheckpoint(checkpoints, 'user_facing_result_prepared')
        || messages.some((message) => message.kind === 'final_response')
      )
      const hasAwaitingOperatorProposal = proposals.some((proposal) => (
        proposal.status === 'awaiting_operator'
      ))
      const hasGovernanceIntervention = (
        votes.some((vote) => (
          vote.voterRole === 'governance'
          && ['challenge', 'reject', 'veto'].includes(vote.vote)
        ))
        || messages.some((message) => (
          message.fromParticipantId === 'governance'
          && (message.kind === 'challenge' || message.kind === 'veto')
        ))
      )
      const hasBlockingDeliberationChallenge = messages.some((message) => (
        message.blocking
        && message.kind === 'challenge'
        && message.fromParticipantId !== 'governance'
      ))
      const hasVerificationProposal = proposals.some((proposal) => (
        proposal.proposalKind === 'verify_external_claim'
        && isActiveProposal(proposal.status)
      ))
      const hasActiveProposal = proposals.some((proposal) => isActiveProposal(proposal.status))

      if (input.objective.status === 'completed' || input.thread.status === 'completed') {
        return {
          state: 'completed',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      if (
        input.objective.requiresOperatorInput
        || input.objective.status === 'awaiting_operator'
        || hasAwaitingOperatorProposal
      ) {
        return {
          state: 'awaiting_operator',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      if (hasGovernanceIntervention) {
        return {
          state: 'awaiting_governance',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      if (verificationVerdict === 'mixed' || verificationVerdict === 'contradicted') {
        return {
          state: 'conflict_unresolved',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      if (hasUserFacingResult) {
        return {
          state: 'ready_to_converge',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      if (!hasBlockingDeliberationChallenge && (
        hasVerificationProposal
        || verificationVerdict === 'insufficient'
      )) {
        return {
          state: 'waiting_for_external_evidence',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      if (
        input.roundsWithoutProgress >= 2
        && !input.hasNewArtifacts
        && !hasActiveProposal
      ) {
        return {
          state: 'stalled',
          verificationVerdict,
          hasUserFacingResult
        }
      }

      return {
        state: 'exploring',
        verificationVerdict,
        hasUserFacingResult
      }
    }
  }
}
