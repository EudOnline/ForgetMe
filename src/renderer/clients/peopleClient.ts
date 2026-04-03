import type {
  ArchiveApi,
  CanonicalPersonDetail,
  CanonicalPersonSummary,
  ContextPackExportResult,
  GroupContextPack,
  PersonContextPack,
  PersonDossier,
  PersonGraph,
  PersonProfileAttribute,
  PersonTimelineEvent,
  ProfileAttributeCandidate
} from '../../shared/archiveContracts'
import { bridgeMethod } from './clientHelpers'

type PeopleClient = Pick<
  ArchiveApi,
  | 'selectContextPackExportDestination'
  | 'listCanonicalPeople'
  | 'getCanonicalPerson'
  | 'getPersonDossier'
  | 'getPersonContextPack'
  | 'listGroupPortraits'
  | 'getGroupPortrait'
  | 'getGroupContextPack'
  | 'exportPersonContextPack'
  | 'exportGroupContextPack'
  | 'getPersonTimeline'
  | 'getPersonGraph'
  | 'listPersonProfileAttributes'
  | 'listProfileAttributeCandidates'
  | 'approveProfileAttributeCandidate'
  | 'rejectProfileAttributeCandidate'
  | 'undoProfileAttributeDecision'
  | 'setRelationshipLabel'
>

export function getPeopleClient(): PeopleClient {
  return {
    selectContextPackExportDestination: bridgeMethod('selectContextPackExportDestination', async () => null),
    listCanonicalPeople: bridgeMethod('listCanonicalPeople', async () => [] as CanonicalPersonSummary[]),
    getCanonicalPerson: bridgeMethod('getCanonicalPerson', async (_canonicalPersonId: string) => null as CanonicalPersonDetail | null),
    getPersonDossier: bridgeMethod('getPersonDossier', async (_canonicalPersonId: string) => null as PersonDossier | null),
    getPersonContextPack: bridgeMethod('getPersonContextPack', async (_input: { canonicalPersonId: string }) => null as PersonContextPack | null),
    listGroupPortraits: bridgeMethod('listGroupPortraits', async () => []),
    getGroupPortrait: bridgeMethod('getGroupPortrait', async (_canonicalPersonId: string) => null),
    getGroupContextPack: bridgeMethod('getGroupContextPack', async (_input: { anchorPersonId: string }) => null as GroupContextPack | null),
    exportPersonContextPack: bridgeMethod(
      'exportPersonContextPack',
      async (_input: { canonicalPersonId: string; destinationRoot: string }) => null as ContextPackExportResult | null
    ),
    exportGroupContextPack: bridgeMethod(
      'exportGroupContextPack',
      async (_input: { anchorPersonId: string; destinationRoot: string }) => null as ContextPackExportResult | null
    ),
    getPersonTimeline: bridgeMethod('getPersonTimeline', async (_canonicalPersonId: string) => [] as PersonTimelineEvent[]),
    getPersonGraph: bridgeMethod('getPersonGraph', async (_canonicalPersonId: string) => ({ nodes: [], edges: [] } as PersonGraph)),
    listPersonProfileAttributes: bridgeMethod('listPersonProfileAttributes', async () => [] as PersonProfileAttribute[]),
    listProfileAttributeCandidates: bridgeMethod('listProfileAttributeCandidates', async () => [] as ProfileAttributeCandidate[]),
    approveProfileAttributeCandidate: bridgeMethod(
      'approveProfileAttributeCandidate',
      async (queueItemId: string) => ({ status: 'approved' as const, journalId: '', queueItemId, candidateId: '' })
    ),
    rejectProfileAttributeCandidate: bridgeMethod(
      'rejectProfileAttributeCandidate',
      async ({ queueItemId }: { queueItemId: string; note?: string }) => ({ status: 'rejected' as const, journalId: '', queueItemId, candidateId: '' })
    ),
    undoProfileAttributeDecision: bridgeMethod(
      'undoProfileAttributeDecision',
      async (journalId: string) => ({ status: 'undone' as const, journalId })
    ),
    setRelationshipLabel: bridgeMethod('setRelationshipLabel', async () => ({ id: '', status: 'approved' as const }))
  }
}
