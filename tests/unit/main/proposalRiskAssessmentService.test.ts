import { describe, expect, it } from 'vitest'
import { assessProposalRisk } from '../../../src/main/services/proposalRiskAssessmentService'

describe('proposal risk assessment service', () => {
  it('tags assessments with policy-matrix provenance so runtime decisions are centrally auditable', () => {
    const result = assessProposalRisk({
      proposalKind: 'respond_to_user',
      payload: {
        channel: 'workspace'
      },
      toolPolicyId: null,
      artifactRefs: []
    })

    expect(result.riskReasons).toContain('policy_matrix_v1')
  })

  it('defaults local reversible proposals to auto-commit', () => {
    const result = assessProposalRisk({
      proposalKind: 'spawn_subagent',
      payload: {
        specialization: 'compare-analyst'
      },
      toolPolicyId: 'workspace-compare-policy',
      artifactRefs: []
    })

    expect(result).toEqual(expect.objectContaining({
      proposalRiskLevel: 'low',
      autonomyDecision: 'auto_commit',
      riskReasons: ['local_reversible_workflow']
    }))
  })

  it('escalates public publication boundaries to await-operator', () => {
    const result = assessProposalRisk({
      proposalKind: 'publish_draft',
      payload: {
        destination: 'public_share'
      },
      toolPolicyId: null,
      artifactRefs: [
        {
          kind: 'external_citation_bundle',
          id: 'https://share.example.test/published',
          label: 'Published share destination'
        }
      ]
    })

    expect(result).toEqual(expect.objectContaining({
      proposalRiskLevel: 'critical',
      autonomyDecision: 'await_operator'
    }))
    expect(result.riskReasons).toContain('public_distribution_boundary')
    expect(result.riskReasons).toContain('critical_boundary')
  })

  it('does not force high but reversible proposals to await operator', () => {
    const result = assessProposalRisk({
      proposalKind: 'approve_safe_group',
      payload: {
        groupKey: 'group-safe-42'
      },
      toolPolicyId: null,
      artifactRefs: []
    })

    expect(result).toEqual(expect.objectContaining({
      proposalRiskLevel: 'high',
      autonomyDecision: 'auto_commit_with_audit'
    }))
  })
})
