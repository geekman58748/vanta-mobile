/**
 * Load local env files — must be the FIRST import in server.js.
 *
 * ESM hoists and evaluates imports in source order *before* any other module
 * body runs, so an env loader written inline in server.js executes too late:
 * `db.js` would read DATABASE_URL at module scope before the file was parsed,
 * and the whole database layer would silently report "not configured".
 *
 * Development only. Production sets real env vars as platform secrets and must
 * not have them shadowed by a stray file on disk.
 */
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

if (process.env.NODE_ENV !== 'production') {
  for (const file of [join(__dirname, '.env'), join(__dirname, '..', '.env.local')]) {
    try {
      process.loadEnvFile(file)
    } catch {
      /* absent — fine */
    }
  }
}
