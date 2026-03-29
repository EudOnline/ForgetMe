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

function normalizeExtension(extension: string) {
  const normalized = extension.trim().toLowerCase()
  if (!normalized) {
    return ''
  }

  return normalized.startsWith('.') ? normalized : `.${normalized}`
}

function buildNormalizedDuplicateKey(fileName: string, extension: string) {
  return `${normalizeFileName(fileName)}::${normalizeExtension(extension)}`
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
    const candidates = input.sourcePaths.map((sourcePath) => {
      const fileName = path.basename(sourcePath)
      const normalizedFileName = normalizeFileName(fileName)
      const extension = normalizeExtension(path.extname(fileName))
      const isSupported = isSupportedImportExtension(extension)
      const duplicateKey = buildNormalizedDuplicateKey(fileName, extension)

      return {
        sourcePath,
        fileName,
        extension,
        normalizedFileName,
        duplicateKey,
        importKindHint: classifyImportKindHint(extension),
        isSupported
      }
    })
    const supportedCandidates = candidates.filter((candidate) => candidate.isSupported)
    const supportedDuplicateKeys = new Set(supportedCandidates.map((candidate) => candidate.duplicateKey))
    const supportedFileNames = [...new Set(supportedCandidates.map((candidate) => candidate.normalizedFileName))]
    const supportedExtensions = [...new Set(supportedCandidates.map((candidate) => candidate.extension))]
    const existingKeys = new Set<string>()

    if (supportedFileNames.length > 0 && supportedExtensions.length > 0) {
      const fileNamePlaceholders = supportedFileNames.map(() => '?').join(', ')
      const extensionPlaceholders = supportedExtensions.map(() => '?').join(', ')
      const existingRows = db.prepare(
        `select file_name as fileName, extension
         from vault_files
         where deleted_at is null
           and lower(trim(file_name)) in (${fileNamePlaceholders})
           and lower(trim(extension)) in (${extensionPlaceholders})`
      ).all(...supportedFileNames, ...supportedExtensions) as Array<{ fileName: string; extension: string }>

      for (const row of existingRows) {
        const normalizedKey = buildNormalizedDuplicateKey(row.fileName, row.extension)
        if (supportedDuplicateKeys.has(normalizedKey)) {
          existingKeys.add(normalizedKey)
        }
      }
    }

    const seenInBatch = new Set<string>()
    const items = candidates.map((candidate) => {
      const isDuplicateCandidate = candidate.isSupported
        && (existingKeys.has(candidate.duplicateKey) || seenInBatch.has(candidate.duplicateKey))

      if (candidate.isSupported) {
        seenInBatch.add(candidate.duplicateKey)
      }

      return {
        sourcePath: candidate.sourcePath,
        fileName: candidate.fileName,
        extension: candidate.extension,
        normalizedFileName: candidate.normalizedFileName,
        importKindHint: candidate.importKindHint,
        isSupported: candidate.isSupported,
        status: !candidate.isSupported ? 'unsupported' : isDuplicateCandidate ? 'duplicate_candidate' : 'supported'
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
