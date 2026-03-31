import type {
  ReviewEvidenceTrace,
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import {
  loadDecisionJournalById,
  loadEvidenceContext,
  loadFileContext,
  loadLatestDecisionJournal,
  loadProfileCandidate,
  loadQueueItem,
  loadSourceCandidate,
  loadStructuredCandidate,
  resolveEvidenceIdFromJournal,
  resolveJournalForSourceCandidate
} from './reviewEvidenceTraceQueryService'

export function getReviewEvidenceTrace(db: ArchiveDatabase, input: { queueItemId: string }): ReviewEvidenceTrace {
  const queueItem = loadQueueItem(db, input.queueItemId)

  if (queueItem.itemType === 'structured_field_candidate') {
    const candidate = loadStructuredCandidate(db, queueItem.candidateId, queueItem.id)
    const sourceJournal = loadDecisionJournalById(db, candidate.approvedJournalId)
      ?? loadLatestDecisionJournal(db, 'structured_field_candidate', candidate.id)
    const evidenceId = resolveEvidenceIdFromJournal(sourceJournal)

    return {
      queueItem,
      candidate,
      sourceFile: loadFileContext(db, candidate.fileId),
      sourceEvidence: loadEvidenceContext(db, evidenceId),
      sourceCandidate: null,
      sourceJournal
    }
  }

  const candidate = loadProfileCandidate(db, queueItem.candidateId, queueItem.id)
  const sourceCandidate = loadSourceCandidate(db, candidate.sourceCandidateId)
  const sourceJournal = resolveJournalForSourceCandidate(db, sourceCandidate)
    ?? loadDecisionJournalById(db, candidate.approvedJournalId)
    ?? loadLatestDecisionJournal(db, 'profile_attribute_candidate', candidate.id)
  const sourceEvidence = loadEvidenceContext(db, candidate.sourceEvidenceId)
  const sourceFileId = candidate.sourceFileId ?? sourceEvidence?.fileId ?? sourceCandidate?.fileId ?? null

  return {
    queueItem,
    candidate,
    sourceFile: loadFileContext(db, sourceFileId),
    sourceEvidence,
    sourceCandidate: sourceCandidate
      ? {
          candidateId: sourceCandidate.candidateId,
          candidateType: sourceCandidate.candidateType,
          status: sourceCandidate.status
        }
      : null,
    sourceJournal
  }
}
