import type { ArchiveDatabase } from './db'

export function classifyExactDuplicate(existingCount: number) {
  return existingCount > 0 ? 'duplicate_exact' : 'unique'
}

export function countExistingHashes(db: ArchiveDatabase, sha256: string) {
  const row = db
    .prepare('select count(*) as count from vault_files where sha256 = ? and deleted_at is null')
    .get(sha256) as { count: number }

  return row.count
}
