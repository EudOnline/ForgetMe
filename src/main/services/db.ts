import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

export type ArchiveDatabase = Database.Database

export function openDatabase(filename: string) {
  fs.mkdirSync(path.dirname(filename), { recursive: true })
  return new Database(filename)
}

export function runMigrations(db: ArchiveDatabase) {
  const migrationFiles = fs.readdirSync(migrationsDir).filter((fileName) => fileName.endsWith('.sql')).sort()
  for (const migrationFile of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, migrationFile), 'utf8')
    db.exec(sql)
  }
}
