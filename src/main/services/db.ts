import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

const compiledMigrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')
const sourceMigrationsDir = path.join(process.cwd(), 'src/main/services/migrations')

function resolveMigrationsDir() {
  if (fs.existsSync(compiledMigrationsDir)) {
    return compiledMigrationsDir
  }

  return sourceMigrationsDir
}

export type ArchiveDatabase = DatabaseSync

export function openDatabase(filename: string) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  return new DatabaseSync(filename)
}

export function runMigrations(db: ArchiveDatabase) {
  const migrationsDir = resolveMigrationsDir()
  const migrationFiles = fs.readdirSync(migrationsDir).filter((fileName) => fileName.endsWith('.sql')).sort()
  for (const migrationFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8')
    db.exec(sql)
  }
}
