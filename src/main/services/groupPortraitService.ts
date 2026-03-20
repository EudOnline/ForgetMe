import type {
  GroupPortraitBrowseSummary,
  GroupPortrait,
  GroupPortraitCentralPersonSummary,
  GroupPortraitMemberSummary,
  GroupPortraitNarrativeSummary,
  GroupPortraitReplayShortcut,
  GroupPortraitSharedEvidenceSource,
  GroupPortraitSharedEvent,
  GroupPortraitTimelineWindow,
  PersonDossierReviewShortcut
} from '../../shared/archiveContracts'
import type { ArchiveDatabase } from './db'
import { getPersonGraph } from './graphService'
import { listDecisionJournal } from './journalService'
import { listReviewConflictGroups, listReviewWorkbenchItems } from './reviewWorkbenchReadService'
import { getPeopleList } from './timelineService'

type PairwiseEdge = {
  leftPersonId: string
  rightPersonId: string
  sharedFileCount: number
  evidenceFileIds: string[]
  manualLabel: string | null
}

type SharedEventAccumulator = {
  eventId: string
  title: string
  timeStart: string
  timeEnd: string
  memberNamesById: Map<string, string>
  evidenceRefs: GroupPortraitSharedEvent['evidenceRefs']
}

function toEdgeKey(leftPersonId: string, rightPersonId: string) {
  return [leftPersonId, rightPersonId].sort((left, right) => left.localeCompare(right)).join('::')
}

function loadMemberFileRows(db: ArchiveDatabase, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [] as Array<{ canonicalPersonId: string; fileId: string; fileName: string }>
  }

  const placeholders = memberIds.map(() => '?').join(', ')
  return db.prepare(
    `select
      pm.canonical_person_id as canonicalPersonId,
      r.target_id as fileId,
      vf.file_name as fileName
     from person_memberships pm
     join relations r
       on r.source_id = pm.anchor_person_id
      and r.source_type = 'person'
      and r.target_type = 'file'
      and r.relation_type = 'mentioned_in_file'
     join vault_files vf
       on vf.id = r.target_id
     where pm.status = 'active'
       and pm.canonical_person_id in (${placeholders})
     order by r.target_id asc, pm.canonical_person_id asc`
  ).all(...memberIds) as Array<{ canonicalPersonId: string; fileId: string; fileName: string }>
}

function loadManualRelationshipRows(db: ArchiveDatabase, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [] as Array<{ fromPersonId: string; toPersonId: string; label: string }>
  }

  const placeholders = memberIds.map(() => '?').join(', ')
  return db.prepare(
    `select
      from_person_id as fromPersonId,
      to_person_id as toPersonId,
      label
     from canonical_relationship_labels
     where status = 'approved'
       and from_person_id in (${placeholders})
       and to_person_id in (${placeholders})`
  ).all(...memberIds, ...memberIds) as Array<{
    fromPersonId: string
    toPersonId: string
    label: string
  }>
}

function buildPairwiseEdges(db: ArchiveDatabase, memberIds: string[]) {
  const rows = loadMemberFileRows(db, memberIds)
  const fileToMembers = new Map<string, string[]>()
  const edgeMap = new Map<string, PairwiseEdge>()

  for (const row of rows) {
    const members = fileToMembers.get(row.fileId) ?? []
    if (!members.includes(row.canonicalPersonId)) {
      members.push(row.canonicalPersonId)
    }
    fileToMembers.set(row.fileId, members)
  }

  for (const [fileId, fileMembers] of fileToMembers.entries()) {
    for (let index = 0; index < fileMembers.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < fileMembers.length; nextIndex += 1) {
        const leftPersonId = fileMembers[index]!
        const rightPersonId = fileMembers[nextIndex]!
        const key = toEdgeKey(leftPersonId, rightPersonId)
        const existing = edgeMap.get(key) ?? {
          leftPersonId: [leftPersonId, rightPersonId].sort((left, right) => left.localeCompare(right))[0]!,
          rightPersonId: [leftPersonId, rightPersonId].sort((left, right) => left.localeCompare(right))[1]!,
          sharedFileCount: 0,
          evidenceFileIds: [],
          manualLabel: null
        }

        existing.sharedFileCount += 1
        if (!existing.evidenceFileIds.includes(fileId)) {
          existing.evidenceFileIds.push(fileId)
        }
        edgeMap.set(key, existing)
      }
    }
  }

  for (const row of loadManualRelationshipRows(db, memberIds)) {
    const key = toEdgeKey(row.fromPersonId, row.toPersonId)
    const existing = edgeMap.get(key) ?? {
      leftPersonId: [row.fromPersonId, row.toPersonId].sort((left, right) => left.localeCompare(right))[0]!,
      rightPersonId: [row.fromPersonId, row.toPersonId].sort((left, right) => left.localeCompare(right))[1]!,
      sharedFileCount: 0,
      evidenceFileIds: [],
      manualLabel: null
    }
    existing.manualLabel = row.label
    edgeMap.set(key, existing)
  }

  return [...edgeMap.values()]
}

function buildSharedEvidenceSources(
  db: ArchiveDatabase,
  memberIds: string[],
  memberNames: Map<string, string>
) {
  const rows = loadMemberFileRows(db, memberIds)
  const fileMap = new Map<string, { fileId: string; fileName: string; memberIds: string[] }>()

  for (const row of rows) {
    const existing = fileMap.get(row.fileId) ?? {
      fileId: row.fileId,
      fileName: row.fileName,
      memberIds: []
    }

    if (!existing.memberIds.includes(row.canonicalPersonId)) {
      existing.memberIds.push(row.canonicalPersonId)
    }

    fileMap.set(row.fileId, existing)
  }

  return [...fileMap.values()]
    .filter((file) => file.memberIds.length >= 2)
    .map((file) => ({
      fileId: file.fileId,
      fileName: file.fileName,
      memberCount: file.memberIds.length,
      members: file.memberIds
        .map((memberId) => memberNames.get(memberId) ?? memberId)
        .sort((left, right) => left.localeCompare(right)),
      displayType: 'approved_fact' as const
    }))
    .sort((left, right) => {
      if (right.memberCount !== left.memberCount) {
        return right.memberCount - left.memberCount
      }
      const fileNameOrder = left.fileName.localeCompare(right.fileName)
      if (fileNameOrder !== 0) {
        return fileNameOrder
      }
      return left.fileId.localeCompare(right.fileId)
    }) satisfies GroupPortraitSharedEvidenceSource[]
}

function loadSharedEvents(db: ArchiveDatabase, memberIds: string[]) {
  if (memberIds.length === 0) {
    return [] as Array<GroupPortraitSharedEvent & { memberIds: string[] }>
  }

  const placeholders = memberIds.map(() => '?').join(', ')
  const rows = db.prepare(
    `select
      ec.id as eventId,
      ec.title as title,
      ec.time_start as timeStart,
      ec.time_end as timeEnd,
      ecm.canonical_person_id as memberId,
      cp.primary_display_name as memberName,
      vf.id as fileId,
      vf.file_name as fileName
     from event_clusters ec
     join event_cluster_members ecm
       on ecm.event_cluster_id = ec.id
     join canonical_people cp
       on cp.id = ecm.canonical_person_id
     left join event_cluster_evidence ece
       on ece.event_cluster_id = ec.id
     left join vault_files vf
       on vf.id = ece.file_id
     where ec.status = 'approved'
       and ecm.canonical_person_id in (${placeholders})
     order by ec.time_start asc, ec.id asc, cp.primary_display_name asc, vf.file_name asc`
  ).all(...memberIds) as Array<{
    eventId: string
    title: string
    timeStart: string
    timeEnd: string
    memberId: string
    memberName: string
    fileId: string | null
    fileName: string | null
  }>

  const eventMap = new Map<string, SharedEventAccumulator>()

  for (const row of rows) {
    const existing = eventMap.get(row.eventId) ?? {
      eventId: row.eventId,
      title: row.title,
      timeStart: row.timeStart,
      timeEnd: row.timeEnd,
      memberNamesById: new Map<string, string>(),
      evidenceRefs: []
    }

    existing.memberNamesById.set(row.memberId, row.memberName)
    if (row.fileId && row.fileName && !existing.evidenceRefs.some((ref) => ref.id === row.fileId)) {
      existing.evidenceRefs.push({
        kind: 'file',
        id: row.fileId,
        label: row.fileName
      })
    }
    eventMap.set(row.eventId, existing)
  }

  return [...eventMap.values()]
    .filter((event) => event.memberNamesById.size >= 2)
    .map((event) => ({
      eventId: event.eventId,
      title: event.title,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd,
      memberCount: event.memberNamesById.size,
      members: Array.from(event.memberNamesById.values()).sort((left, right) => left.localeCompare(right)),
      memberIds: Array.from(event.memberNamesById.keys()).sort((left, right) => left.localeCompare(right)),
      evidenceRefs: event.evidenceRefs,
      displayType: 'approved_fact' as const
    }))
}

function buildMemberSummaries(input: {
  anchorPersonId: string
  memberNames: Map<string, string>
  edges: PairwiseEdge[]
  sharedEvents: Array<GroupPortraitSharedEvent & { memberIds: string[] }>
}): GroupPortraitMemberSummary[] {
  const connectionCounts = new Map<string, number>()
  const sharedFileCounts = new Map<string, number>()
  const sharedEventCounts = new Map<string, number>()

  for (const personId of input.memberNames.keys()) {
    connectionCounts.set(personId, 0)
    sharedFileCounts.set(personId, 0)
    sharedEventCounts.set(personId, 0)
  }

  for (const edge of input.edges) {
    connectionCounts.set(edge.leftPersonId, (connectionCounts.get(edge.leftPersonId) ?? 0) + 1)
    connectionCounts.set(edge.rightPersonId, (connectionCounts.get(edge.rightPersonId) ?? 0) + 1)
    sharedFileCounts.set(edge.leftPersonId, (sharedFileCounts.get(edge.leftPersonId) ?? 0) + edge.sharedFileCount)
    sharedFileCounts.set(edge.rightPersonId, (sharedFileCounts.get(edge.rightPersonId) ?? 0) + edge.sharedFileCount)
  }

  for (const event of input.sharedEvents) {
    for (const memberId of event.memberIds) {
      sharedEventCounts.set(memberId, (sharedEventCounts.get(memberId) ?? 0) + 1)
    }
  }

  return Array.from(input.memberNames.entries())
    .map(([personId, displayName]) => {
      const edgeToAnchor = input.edges.find((edge) => (
        (edge.leftPersonId === input.anchorPersonId && edge.rightPersonId === personId)
        || (edge.rightPersonId === input.anchorPersonId && edge.leftPersonId === personId)
      ))

      return {
        personId,
        displayName,
        sharedFileCount: sharedFileCounts.get(personId) ?? 0,
        sharedEventCount: sharedEventCounts.get(personId) ?? 0,
        connectionCount: connectionCounts.get(personId) ?? 0,
        manualLabel: personId === input.anchorPersonId ? null : (edgeToAnchor?.manualLabel ?? null),
        isAnchor: personId === input.anchorPersonId,
        displayType: 'approved_fact' as const
      }
    })
    .sort((left, right) => {
      if (Number(right.isAnchor) !== Number(left.isAnchor)) {
        return Number(right.isAnchor) - Number(left.isAnchor)
      }
      if (right.connectionCount !== left.connectionCount) {
        return right.connectionCount - left.connectionCount
      }
      if (right.sharedEventCount !== left.sharedEventCount) {
        return right.sharedEventCount - left.sharedEventCount
      }
      if (right.sharedFileCount !== left.sharedFileCount) {
        return right.sharedFileCount - left.sharedFileCount
      }
      return left.displayName.localeCompare(right.displayName)
    })
}

function buildCentralPeopleSummaries(members: GroupPortraitMemberSummary[]): GroupPortraitCentralPersonSummary[] {
  return members
    .map((member) => ({
      personId: member.personId,
      displayName: member.displayName,
      connectionCount: member.connectionCount,
      sharedFileCount: member.sharedFileCount,
      sharedEventCount: member.sharedEventCount,
      displayType: 'derived_summary' as const
    }))
    .sort((left, right) => {
      if (right.connectionCount !== left.connectionCount) {
        return right.connectionCount - left.connectionCount
      }
      if (right.sharedEventCount !== left.sharedEventCount) {
        return right.sharedEventCount - left.sharedEventCount
      }
      if (right.sharedFileCount !== left.sharedFileCount) {
        return right.sharedFileCount - left.sharedFileCount
      }
      return left.displayName.localeCompare(right.displayName)
    })
}

function buildTimelineWindows(
  sharedEvents: Array<GroupPortraitSharedEvent & { memberIds: string[] }>
): GroupPortraitTimelineWindow[] {
  return sharedEvents
    .map((event) => ({
      windowId: `window:${event.eventId}`,
      title: event.title,
      timeStart: event.timeStart,
      timeEnd: event.timeEnd,
      eventCount: 1,
      memberCount: event.memberCount,
      members: [...event.members],
      eventTitles: [event.title],
      displayType: 'approved_fact' as const
    }))
    .sort((left, right) => {
      const startOrder = left.timeStart.localeCompare(right.timeStart)
      if (startOrder !== 0) {
        return startOrder
      }
      const endOrder = left.timeEnd.localeCompare(right.timeEnd)
      if (endOrder !== 0) {
        return endOrder
      }
      return left.windowId.localeCompare(right.windowId)
    })
}

function formatCount(count: number, singular: string, plural: string) {
  return `${count} ${count === 1 ? singular : plural}`
}

function joinNames(names: string[]) {
  if (names.length === 0) {
    return ''
  }
  if (names.length === 1) {
    return names[0]!
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function buildNarrativeSummary(input: {
  anchorDisplayName: string
  members: GroupPortraitMemberSummary[]
  sharedEvents: Array<GroupPortraitSharedEvent & { memberIds: string[] }>
  sharedEvidenceSources: GroupPortraitSharedEvidenceSource[]
  ambiguity: {
    pendingReviewCount: number
    conflictGroupCount: number
  }
}): GroupPortraitNarrativeSummary[] {
  const otherMembers = input.members
    .filter((member) => !member.isAnchor)
    .map((member) => member.displayName)

  const groupSizeSummary: GroupPortraitNarrativeSummary = otherMembers.length > 0
    ? {
      summaryId: 'group-size',
      text: `${input.anchorDisplayName} anchors a ${input.members.length}-person group with ${joinNames(otherMembers)}.`,
      displayType: 'derived_summary'
    }
    : {
      summaryId: 'group-size',
      text: `${input.anchorDisplayName} does not yet have approved group connections.`,
      displayType: 'coverage_gap'
    }

  const sharedEvidenceSummary: GroupPortraitNarrativeSummary = (
    input.sharedEvents.length > 0 || input.sharedEvidenceSources.length > 0
  )
    ? {
      summaryId: 'shared-evidence',
      text: `The group shares ${formatCount(input.sharedEvents.length, 'approved event', 'approved events')} and ${formatCount(input.sharedEvidenceSources.length, 'shared evidence source', 'shared evidence sources')}.`,
      displayType: 'derived_summary'
    }
    : {
      summaryId: 'shared-evidence',
      text: 'No shared events or shared evidence sources have been approved yet.',
      displayType: 'coverage_gap'
    }

  const ambiguitySummary: GroupPortraitNarrativeSummary = input.ambiguity.pendingReviewCount > 0 || input.ambiguity.conflictGroupCount > 0
    ? {
      summaryId: 'ambiguity',
      text: `Review ambiguity remains: ${formatCount(input.ambiguity.pendingReviewCount, 'pending item', 'pending items')} across ${formatCount(input.ambiguity.conflictGroupCount, 'conflict group', 'conflict groups')}.`,
      displayType: 'open_conflict'
    }
    : {
      summaryId: 'ambiguity',
      text: 'No unresolved ambiguity is currently open for this group.',
      displayType: 'derived_summary'
    }

  return [
    groupSizeSummary,
    sharedEvidenceSummary,
    ambiguitySummary
  ]
}

function buildAmbiguityReviewShortcut(input: {
  pendingItems: ReturnType<typeof listReviewWorkbenchItems>
  conflictGroups: ReturnType<typeof listReviewConflictGroups>
}): PersonDossierReviewShortcut | null {
  const focusConflictGroup = input.conflictGroups[0] ?? null
  const focusPendingItem = input.pendingItems[0] ?? null
  const canonicalPersonId = focusConflictGroup?.canonicalPersonId
    ?? focusPendingItem?.canonicalPersonId
    ?? null

  if (!canonicalPersonId) {
    return null
  }

  const fieldKey = focusConflictGroup?.fieldKey ?? focusPendingItem?.fieldKey ?? undefined
  const hasConflict = input.conflictGroups.length > 0

  return {
    label: hasConflict && fieldKey ? `Open ${fieldKey} conflicts` : 'Open pending review',
    canonicalPersonId,
    fieldKey,
    hasConflict,
    queueItemId: focusConflictGroup?.nextQueueItemId ?? focusPendingItem?.queueItemId ?? undefined
  }
}

function buildReplayShortcuts(memberNames: Map<string, string>, db: ArchiveDatabase): GroupPortraitReplayShortcut[] {
  const searchTokens = new Set(
    [
      ...memberNames.keys(),
      ...memberNames.values()
    ]
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0)
  )

  if (searchTokens.size === 0) {
    return []
  }

  return listDecisionJournal(db)
    .filter((entry) => {
      const haystack = [
        entry.id,
        entry.decisionType,
        entry.targetType,
        entry.targetId,
        entry.actor,
        entry.decisionLabel,
        entry.targetLabel,
        entry.replaySummary,
        JSON.stringify(entry.operationPayload),
        JSON.stringify(entry.undoPayload)
      ].join(' ').toLowerCase()

      return Array.from(searchTokens).some((token) => haystack.includes(token))
    })
    .slice(0, 3)
    .map((entry) => ({
      journalId: entry.id,
      label: entry.replaySummary ?? entry.decisionLabel ?? entry.decisionType,
      query: entry.id,
      displayType: 'approved_fact' as const
    }))
}

export function getGroupPortrait(db: ArchiveDatabase, input: { canonicalPersonId: string }): GroupPortrait | null {
  const graph = getPersonGraph(db, { canonicalPersonId: input.canonicalPersonId })
  const memberNames = new Map(graph.nodes.map((node) => [node.id, node.primaryDisplayName]))

  if (!memberNames.has(input.canonicalPersonId)) {
    return null
  }

  const memberIds = Array.from(memberNames.keys())
  const edges = buildPairwiseEdges(db, memberIds)
  const sharedEvents = loadSharedEvents(db, memberIds)
  const timelineWindows = buildTimelineWindows(sharedEvents)
  const sharedEvidenceSources = buildSharedEvidenceSources(db, memberIds, memberNames)
  const replayShortcuts = buildReplayShortcuts(memberNames, db)
  const members = buildMemberSummaries({
    anchorPersonId: input.canonicalPersonId,
    memberNames,
    edges,
    sharedEvents
  })
  const centralPeople = buildCentralPeopleSummaries(members)

  const pendingItems = listReviewWorkbenchItems(db, { status: 'pending' })
    .filter((item) => item.canonicalPersonId && memberNames.has(item.canonicalPersonId))
  const conflictGroups = listReviewConflictGroups(db)
    .filter((group) => group.canonicalPersonId && memberNames.has(group.canonicalPersonId) && group.hasConflict)
  const ambiguityReviewShortcut = buildAmbiguityReviewShortcut({
    pendingItems,
    conflictGroups
  })

  const possibleEdgeCount = memberIds.length > 1 ? (memberIds.length * (memberIds.length - 1)) / 2 : 0
  const actualEdgeCount = edges.length
  const densityRatio = possibleEdgeCount > 0 ? actualEdgeCount / possibleEdgeCount : 0
  const anchorDisplayName = memberNames.get(input.canonicalPersonId) ?? input.canonicalPersonId
  const narrativeSummary = buildNarrativeSummary({
    anchorDisplayName,
    members,
    sharedEvents,
    sharedEvidenceSources,
    ambiguity: {
      pendingReviewCount: pendingItems.length,
      conflictGroupCount: conflictGroups.length
    }
  })

  return {
    anchorPersonId: input.canonicalPersonId,
    title: `${anchorDisplayName} Group Portrait`,
    members,
    relationshipDensity: {
      memberCount: memberIds.length,
      actualEdgeCount,
      possibleEdgeCount,
      densityRatio,
      displayType: actualEdgeCount > 0 ? 'derived_summary' : 'coverage_gap'
    },
    sharedEvents: sharedEvents.map(({ memberIds: _memberIds, ...event }) => event),
    timelineWindows,
    narrativeSummary,
    sharedEvidenceSources,
    replayShortcuts,
    centralPeople,
    ambiguitySummary: {
      pendingReviewCount: pendingItems.length,
      conflictGroupCount: conflictGroups.length,
      affectedMemberCount: new Set(
        pendingItems
          .map((item) => item.canonicalPersonId)
          .filter((personId): personId is string => Boolean(personId))
      ).size,
      displayType: pendingItems.length > 0 || conflictGroups.length > 0 ? 'open_conflict' : 'derived_summary',
      reviewShortcut: ambiguityReviewShortcut
    }
  }
}

export function listGroupPortraits(db: ArchiveDatabase): GroupPortraitBrowseSummary[] {
  return getPeopleList(db)
    .map((person) => getGroupPortrait(db, { canonicalPersonId: person.id }))
    .filter((portrait): portrait is GroupPortrait => portrait !== null)
    .filter((portrait) => portrait.members.length >= 2)
    .map((portrait) => ({
      anchorPersonId: portrait.anchorPersonId,
      anchorDisplayName: portrait.members.find((member) => member.isAnchor)?.displayName ?? portrait.anchorPersonId,
      title: portrait.title,
      memberCount: portrait.members.length,
      sharedEventCount: portrait.sharedEvents.length,
      sharedEvidenceSourceCount: portrait.sharedEvidenceSources.length,
      densityRatio: portrait.relationshipDensity.densityRatio,
      membersPreview: portrait.members.slice(0, 3).map((member) => member.displayName),
      displayType: 'derived_summary' as const
    }))
    .sort((left, right) => {
      if (right.memberCount !== left.memberCount) {
        return right.memberCount - left.memberCount
      }
      if (right.sharedEventCount !== left.sharedEventCount) {
        return right.sharedEventCount - left.sharedEventCount
      }
      if (right.densityRatio !== left.densityRatio) {
        return right.densityRatio - left.densityRatio
      }
      return left.title.localeCompare(right.title)
    })
}
