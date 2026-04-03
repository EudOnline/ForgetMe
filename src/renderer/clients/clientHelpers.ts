import type { ArchiveApi } from '../../shared/archiveContracts'

export function bridgeMethod<K extends keyof ArchiveApi>(
  name: K,
  fallback: ArchiveApi[K]
): ArchiveApi[K] {
  const bridge = window.archiveApi
  const candidate = bridge?.[name]

  if (typeof candidate === 'function') {
    return candidate.bind(bridge) as ArchiveApi[K]
  }

  return fallback
}
