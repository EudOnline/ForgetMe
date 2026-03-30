import type { DocumentEvidence, EnrichmentJob } from '../../../shared/archiveContracts'
import { getDocumentEvidence, rerunEnrichmentJob } from '../enrichmentReadService'
import type { AgentAdapter } from './agentTypes'

type CreateImportBatchDependency = (...args: unknown[]) => Promise<unknown> | unknown

type IngestionAgentDependencies = {
  createImportBatch?: CreateImportBatchDependency
  rerunEnrichmentJob?: typeof rerunEnrichmentJob
  getDocumentEvidence?: typeof getDocumentEvidence
}

function extractPromptToken(prompt: string, pattern: RegExp, label: string) {
  const match = prompt.match(pattern)
  if (!match) {
    throw new Error(`Missing ${label} in prompt`)
  }

  return match[1] ?? match[0]
}

function extractOptionalFileId(prompt: string) {
  const match = prompt.match(/\b(file-[A-Za-z0-9-]+)\b/i)
  return match?.[1] ?? match?.[0] ?? null
}

function summarizeEvidence(evidence: DocumentEvidence) {
  const rawExcerpt = evidence.rawText.trim().slice(0, 120) || 'No raw text available.'
  return `Evidence summary for ${evidence.fileName}: ${evidence.approvedFields.length} approved fields, ${evidence.fieldCandidates.length} pending candidates. Excerpt: ${rawExcerpt}`
}

export function createIngestionAgentService(
  dependencies: IngestionAgentDependencies = {}
): AgentAdapter {
  const rerunJob = dependencies.rerunEnrichmentJob ?? rerunEnrichmentJob
  const readDocumentEvidence = dependencies.getDocumentEvidence ?? getDocumentEvidence

  return {
    role: 'ingestion',
    canHandle(taskKind) {
      return [
        'ingestion.import_batch',
        'ingestion.rerun_enrichment',
        'ingestion.summarize_document_evidence'
      ].includes(taskKind)
    },
    async receive(context) {
      if (context.objective.objectiveKind === 'evidence_investigation') {
        const fileId = extractOptionalFileId(context.objective.prompt)
        if (!fileId) {
          return {
            messages: []
          }
        }

        return {
          messages: [],
          spawnRequests: [
            {
              specialization: 'evidence-checker',
              ownerRole: 'workspace',
              payload: {
                fileId
              },
              requiredApprovals: ['workspace'],
              allowVetoBy: ['governance'],
              requiresOperatorConfirmation: false
            }
          ]
        }
      }

      return {
        messages: []
      }
    },
    async execute(context) {
      switch (context.taskKind) {
        case 'ingestion.import_batch':
          return {
            messages: [
              {
                sender: 'tool',
                content: `Import plan prepared from prompt: ${context.input.prompt}`
              },
              {
                sender: 'agent',
                content: 'Import batch planning complete. Select files through the existing import flow before execution.'
              }
            ]
          }
        case 'ingestion.rerun_enrichment': {
          const jobId = extractPromptToken(context.input.prompt, /\b(job-[A-Za-z0-9-]+)\b/i, 'job id')
          const rerunJobRecord = rerunJob(context.db, { jobId }) as EnrichmentJob | null

          return {
            messages: [
              {
                sender: 'tool',
                content: rerunJobRecord
                  ? `Queued rerun as ${rerunJobRecord.id} for ${rerunJobRecord.fileName}.`
                  : `No rerun job could be created for ${jobId}.`
              },
              {
                sender: 'agent',
                content: rerunJobRecord
                  ? `Enrichment rerun created for ${rerunJobRecord.fileName} with status ${rerunJobRecord.status}.`
                  : `Unable to rerun enrichment for ${jobId}.`
              }
            ]
          }
        }
        case 'ingestion.summarize_document_evidence': {
          const fileId = extractPromptToken(context.input.prompt, /\b(file-[A-Za-z0-9-]+)\b/i, 'file id')
          const evidence = readDocumentEvidence(context.db, { fileId })

          if (!evidence) {
            throw new Error(`Document evidence not found for ${fileId}`)
          }

          return {
            messages: [
              {
                sender: 'tool',
                content: `Loaded document evidence for ${evidence.fileName}.`
              },
              {
                sender: 'agent',
                content: summarizeEvidence(evidence)
              }
            ]
          }
        }
      }

      throw new Error(`Unsupported ingestion task kind: ${context.taskKind}`)
    }
  }
}
