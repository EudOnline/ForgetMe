import type { ArchiveApi } from '../../shared/archiveContracts'
import { getImportClient } from './importClient'
import { getObjectiveClient } from './objectiveClient'
import { getOpsClient } from './opsClient'
import { getPeopleClient } from './peopleClient'
import { getReviewClient } from './reviewClient'
import { getWorkspaceClient } from './workspaceClient'

export function buildArchiveApiBridge(): ArchiveApi {
  return Object.assign(
    {},
    getImportClient(),
    getPeopleClient(),
    getReviewClient(),
    getWorkspaceClient(),
    getObjectiveClient(),
    getOpsClient()
  )
}
