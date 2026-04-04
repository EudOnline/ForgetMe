import { describe, expect, it } from 'vitest'
import {
  hasOperatorGatedProposal,
  objectiveNeedsOperator,
  proposalHasCriticalBoundary,
  proposalIsAutoCommittable,
  proposalNeedsOperator
} from '../../../src/main/services/objectiveAutonomySelectorsService'

describe('objective autonomy selectors service', () => {
  it('classifies critical proposals as operator-gated boundaries', () => {
    expect(proposalHasCriticalBoundary({
      proposalRiskLevel: 'critical'
    })).toBe(true)
    expect(proposalNeedsOperator({
      proposalRiskLevel: 'critical',
      autonomyDecision: 'auto_commit_with_audit',
      requiresOperatorConfirmation: false
    })).toBe(true)
  })

  it('keeps reversible non-critical proposals auto-committable after committable status', () => {
    expect(proposalNeedsOperator({
      proposalRiskLevel: 'high',
      autonomyDecision: 'auto_commit_with_audit',
      requiresOperatorConfirmation: false
    })).toBe(false)
    expect(proposalIsAutoCommittable({
      status: 'committable',
      proposalRiskLevel: 'high',
      autonomyDecision: 'auto_commit_with_audit',
      requiresOperatorConfirmation: false
    })).toBe(true)
  })

  it('derives objective operator requirement from objective flags and proposal statuses', () => {
    expect(objectiveNeedsOperator({
      status: 'awaiting_operator',
      requiresOperatorInput: false
    })).toBe(true)

    expect(objectiveNeedsOperator({
      status: 'in_progress',
      requiresOperatorInput: false
    }, [
      { status: 'awaiting_operator' }
    ])).toBe(true)

    expect(hasOperatorGatedProposal([
      { status: 'under_review' },
      { status: 'awaiting_operator' }
    ])).toBe(true)
  })
})
