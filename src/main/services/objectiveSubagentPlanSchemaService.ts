import type { AgentSkillPackId } from '../../shared/archiveContracts'

export type SubagentPlanningSchemaId =
  | 'web-verification-plan'
  | 'local-evidence-check-plan'
  | 'compare-analysis-plan'
  | 'draft-composition-plan'
  | 'policy-audit-plan'

export type ObjectiveSubagentPlanSchema = {
  specialization: AgentSkillPackId
  schemaId: SubagentPlanningSchemaId
  toolSequence: string[]
  stepTemplates: Array<{
    stepId: string
    title: string
    toolName?: string
    repeatable?: boolean
    condition?: string
  }>
  expectedArtifacts: string[]
  stopConditions: string[]
}

const PLAN_SCHEMAS: Record<AgentSkillPackId, ObjectiveSubagentPlanSchema> = {
  'web-verifier': {
    specialization: 'web-verifier',
    schemaId: 'web-verification-plan',
    toolSequence: ['search_web', 'open_source_page', 'capture_citation_bundle'],
    stepTemplates: [
      {
        stepId: 'search-sources',
        title: 'Search candidate sources',
        toolName: 'search_web'
      },
      {
        stepId: 'inspect-sources',
        title: 'Inspect candidate sources',
        toolName: 'open_source_page',
        repeatable: true
      },
      {
        stepId: 'capture-citation-bundle',
        title: 'Capture citation bundle',
        toolName: 'capture_citation_bundle'
      },
      {
        stepId: 'delegate-local-evidence-check',
        title: 'Delegate local evidence cross-check',
        condition: 'when localEvidenceFileId is present'
      }
    ],
    expectedArtifacts: ['external_citation_bundle'],
    stopConditions: [
      'stop when citation bundle is captured',
      'stop early when budget or timeout is exhausted'
    ]
  },
  'evidence-checker': {
    specialization: 'evidence-checker',
    schemaId: 'local-evidence-check-plan',
    toolSequence: ['get_document_evidence'],
    stepTemplates: [
      {
        stepId: 'load-document-evidence',
        title: 'Load document evidence',
        toolName: 'get_document_evidence'
      },
      {
        stepId: 'summarize-local-evidence',
        title: 'Summarize local evidence'
      },
      {
        stepId: 'delegate-external-cross-check',
        title: 'Delegate external cross-check',
        condition: 'when crossCheckClaim and crossCheckQuery are present'
      }
    ],
    expectedArtifacts: ['file'],
    stopConditions: [
      'stop when local evidence summary is prepared',
      'stop early when budget or timeout is exhausted'
    ]
  },
  'compare-analyst': {
    specialization: 'compare-analyst',
    schemaId: 'compare-analysis-plan',
    toolSequence: ['run_compare', 'summarize_compare_results'],
    stepTemplates: [
      {
        stepId: 'run-compare',
        title: 'Run bounded compare session',
        toolName: 'run_compare'
      },
      {
        stepId: 'summarize-compare',
        title: 'Summarize compare results',
        toolName: 'summarize_compare_results'
      }
    ],
    expectedArtifacts: ['compare_session'],
    stopConditions: [
      'stop when compare summary is prepared',
      'stop early when budget or timeout is exhausted'
    ]
  },
  'draft-composer': {
    specialization: 'draft-composer',
    schemaId: 'draft-composition-plan',
    toolSequence: ['ask_memory_workspace', 'compose_reviewed_draft'],
    stepTemplates: [
      {
        stepId: 'load-workspace-turn',
        title: 'Load workspace turn',
        toolName: 'ask_memory_workspace'
      },
      {
        stepId: 'compose-draft',
        title: 'Compose reviewed draft',
        toolName: 'compose_reviewed_draft'
      }
    ],
    expectedArtifacts: ['workspace_turn'],
    stopConditions: [
      'stop when reviewed draft is prepared',
      'stop early when budget or timeout is exhausted'
    ]
  },
  'policy-auditor': {
    specialization: 'policy-auditor',
    schemaId: 'policy-audit-plan',
    toolSequence: ['read_policy_versions', 'compare_policy_versions'],
    stepTemplates: [
      {
        stepId: 'read-policy-versions',
        title: 'Read bounded policy versions',
        toolName: 'read_policy_versions'
      },
      {
        stepId: 'compare-policy-versions',
        title: 'Compare policy versions',
        toolName: 'compare_policy_versions'
      }
    ],
    expectedArtifacts: ['policy_version'],
    stopConditions: [
      'stop when policy audit summary is prepared',
      'stop early when budget or timeout is exhausted'
    ]
  }
}

export function createObjectiveSubagentPlanSchemaService() {
  return {
    getSchema(specialization: AgentSkillPackId): ObjectiveSubagentPlanSchema {
      const schema = PLAN_SCHEMAS[specialization]
      if (!schema) {
        throw new Error(`Unknown subagent plan schema for specialization: ${specialization}`)
      }

      return {
        specialization: schema.specialization,
        schemaId: schema.schemaId,
        toolSequence: [...schema.toolSequence],
        stepTemplates: schema.stepTemplates.map((step) => ({ ...step })),
        expectedArtifacts: [...schema.expectedArtifacts],
        stopConditions: [...schema.stopConditions]
      }
    }
  }
}
