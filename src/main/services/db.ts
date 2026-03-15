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

const MIGRATIONS_TABLE = '_schema_migrations'

export function openDatabase(filename: string) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  return new DatabaseSync(filename)
}

export function runMigrations(db: ArchiveDatabase) {
  db.exec(
    `create table if not exists ${MIGRATIONS_TABLE} (
      file_name text primary key,
      applied_at text not null
    )`
  )

  const appliedRows = db.prepare(
    `select file_name as fileName from ${MIGRATIONS_TABLE}`
  ).all() as Array<{ fileName: string }>
  const appliedFiles = new Set(appliedRows.map((row) => row.fileName))
  const migrationsDir = resolveMigrationsDir()
  const migrationFiles = fs.readdirSync(migrationsDir).filter((fileName) => fileName.endsWith('.sql')).sort()
  for (const migrationFile of migrationFiles) {
    if (appliedFiles.has(migrationFile)) {
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8')
    db.exec('begin immediate')
    try {
      db.exec(sql)
      db.prepare(
        `insert into ${MIGRATIONS_TABLE} (file_name, applied_at) values (?, ?)`
      ).run(migrationFile, new Date().toISOString())
      db.exec('commit')
      appliedFiles.add(migrationFile)
    } catch (error) {
      db.exec('rollback')
      throw error
    }
  }
}
