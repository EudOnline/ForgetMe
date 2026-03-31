import type {
  AgentArtifactRef,
  AgentPolicyVersionRecord,
  AgentRole
} from '../../../shared/archiveContracts'

export type PolicyAuditorPayload = {
  policyKey: string
  role: AgentRole
}

export type PolicyVersionSnapshot = AgentPolicyVersionRecord

type AuthorizedToolRunner = <T>(input: {
  toolName: string
  inputPayload: Record<string, unknown>
  run: () => Promise<{
    result: T
    outputPayload: Record<string, unknown>
    artifactRefs?: AgentArtifactRef[]
  }>
}) => Promise<T>

type PolicyAuditorTaskInput = {
  payload: PolicyAuditorPayload
  listPolicyVersions: (payload: PolicyAuditorPayload) => PolicyVersionSnapshot[]
  runTool: AuthorizedToolRunner
}

export function parsePolicyAuditorPayload(payload: Record<string, unknown>): PolicyAuditorPayload {
  const policyKey = typeof payload.policyKey === 'string' ? payload.policyKey.trim() : ''
  if (!policyKey) {
    throw new Error('policy-auditor payload requires a non-empty policyKey')
  }

  return {
    policyKey,
    role: payload.role === 'workspace' || payload.role === 'review' || payload.role === 'ingestion'
      ? payload.role
      : 'governance'
  }
}

export async function runPolicyAuditorTask(input: PolicyAuditorTaskInput) {
  const versions = await input.runTool({
    toolName: 'read_policy_versions',
    inputPayload: {
      role: input.payload.role,
      policyKey: input.payload.policyKey
    },
    run: async () => {
      const result = input.listPolicyVersions(input.payload)
      if (result.length === 0) {
        throw new Error(`No policy versions found for ${input.payload.policyKey}`)
      }

      return {
        result,
        outputPayload: {
          policyKey: input.payload.policyKey,
          versionCount: result.length
        },
        artifactRefs: result.map((version) => ({
          kind: 'policy_version' as const,
          id: version.policyVersionId,
          label: version.policyKey
        }))
      }
    }
  })

  const summary = await input.runTool({
    toolName: 'compare_policy_versions',
    inputPayload: {
      policyKey: input.payload.policyKey,
      versionCount: versions.length
    },
    run: async () => {
      const [latest, previous] = versions
      const diffSummary = previous
        ? latest.policyBody === previous.policyBody
          ? `Latest policy version ${latest.policyVersionId} matches ${previous.policyVersionId}.`
          : `Latest policy version ${latest.policyVersionId} differs from ${previous.policyVersionId}.`
        : `Only one policy version (${latest.policyVersionId}) is currently available.`

      return {
        result: diffSummary,
        outputPayload: {
          latestPolicyVersionId: latest.policyVersionId,
          previousPolicyVersionId: previous?.policyVersionId ?? null
        },
        artifactRefs: versions.slice(0, 2).map((version) => ({
          kind: 'policy_version' as const,
          id: version.policyVersionId,
          label: version.policyKey
        }))
      }
    }
  })

  return {
    summary,
    artifactRefs: versions.slice(0, 2).map((version) => ({
      kind: 'policy_version' as const,
      id: version.policyVersionId,
      label: version.policyKey
    }))
  }
}
