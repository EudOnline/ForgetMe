import type { ArchiveApi } from '../shared/archiveContracts'
import { buildArchiveApiBridge } from './clients'

export function getArchiveApi(): ArchiveApi {
  return window.archiveApi ?? buildArchiveApiBridge()
}
