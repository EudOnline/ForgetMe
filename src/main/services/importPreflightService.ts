import path from 'node:path'
import type { ImportPreflightItem, ImportPreflightResult } from '../../shared/archiveContracts'
import {
  isSupportedImportExtension,
  SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS,
  SUPPORTED_IMAGE_IMPORT_EXTENSIONS
} from '../../shared/archiveTypes'
import type { AppPaths } from './appPaths'
import { openDatabase, runMigrations } from './db'

function databasePath(appPaths: AppPaths) {
  return path.join(appPaths.sqliteDir, 'archive.sqlite')
}

function normalizeFileName(fileName: string) {
  return fileName.trim().toLowerCase()
}

function classifyImportKindHint(extension: string): ImportPreflightItem['importKindHint'] {
  if (extension === '.json' || extension === '.txt') {
    return 'chat'
  }

  if (SUPPORTED_IMAGE_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMAGE_IMPORT_EXTENSIONS)[number])) {
    return 'image'
  }

  if (SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_DOCUMENT_IMPORT_EXTENSIONS)[number])) {
    return 'document'
  }

  return 'unknown'
}

export async function buildImportPreflight(input: {
  appPaths: AppPaths
  sourcePaths: string[]
}): Promise<ImportPreflightResult> {
  const db = openDatabase(databasePath(input.appPaths))
  runMigrations(db)

  try {
    const existingRows = db.prepare(
      `select lower(file_name) as fileName, lower(extension) as extension
       from vault_files
       where deleted_at is null`
    ).all() as Array<{ fileName: string; extension: string }>
    const existingKeys = new Set(existingRows.map((row) => `${row.fileName}::${row.extension}`))
    const seenInBatch = new Set<string>()

    const items = input.sourcePaths.map((sourcePath) => {
      const fileName = path.basename(sourcePath)
      const normalizedFileName = normalizeFileName(fileName)
      const extension = path.extname(fileName).toLowerCase()
      const isSupported = isSupportedImportExtension(extension)
      const duplicateKey = `${normalizedFileName}::${extension}`
      const isDuplicateCandidate = isSupported && (existingKeys.has(duplicateKey) || seenInBatch.has(duplicateKey))

      if (isSupported) {
        seenInBatch.add(duplicateKey)
      }

      return {
        sourcePath,
        fileName,
        extension,
        normalizedFileName,
        importKindHint: classifyImportKindHint(extension),
        isSupported,
        status: !isSupported ? 'unsupported' : isDuplicateCandidate ? 'duplicate_candidate' : 'supported'
      } satisfies ImportPreflightItem
    })

    return {
      items,
      summary: {
        totalCount: items.length,
        supportedCount: items.filter((item) => item.isSupported).length,
        unsupportedCount: items.filter((item) => !item.isSupported).length
      }
    }
  } finally {
    db.close()
  }
}
