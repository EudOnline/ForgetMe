import { describe, expect, it } from 'vitest'
import { evaluateAutonomyPolicy } from '../../../src/main/services/autonomyPolicyMatrixService'

describe('autonomy policy matrix service', () => {
  it('keeps high but reversible review progression in auto-commit-with-audit', () => {
    const result = evaluateAutonomyPolicy({
      proposalKind: 'approve_safe_group',
      payload: {
        groupKey: 'group-safe-42'
      },
      boundaries: {
        reversible: true,
        externalPublication: false,
        sensitiveExternalEgress: false
      }
    })

    expect(result.proposalRiskLevel).toBe('high')
    expect(result.autonomyDecision).toBe('auto_commit_with_audit')
  })

  it('returns await_operator only when the evaluated boundary is truly critical', () => {
    const result = evaluateAutonomyPolicy({
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      boundaries: {
        reversible: false,
        externalPublication: true,
        sensitiveExternalEgress: true
      }
    })

    expect(result.proposalRiskLevel).toBe('critical')
    expect(result.autonomyDecision).toBe('await_operator')
    expect(result.riskReasons).toContain('critical_boundary_public_distribution')
  })
})
