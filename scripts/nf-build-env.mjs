/**
 * Assemble the relayer's production runtime environment for Northflank and
 * apply the two client-side vars to .env.local.
 *
 * Secrets are written straight to files (mode 600) — never to stdout.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// ── Read local env (simple KEY=VALUE, no interpolation needed) ──
const envText = readFileSync(join(root, '.env.local'), 'utf-8')
const local = {}
for (const line of envText.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) local[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const required = ['DATABASE_URL', 'VITE_HELIUS_API_KEY']
for (const k of required) {
  if (!local[k]) throw new Error(`${k} missing from .env.local — cannot build env`)
}

// ── Keypair: reuse the existing funded relayer key ──
const kpPath = join(root, 'relayer', 'relayer-keypair.json')
if (!existsSync(kpPath)) throw new Error('relayer/relayer-keypair.json missing')
const secretArr = JSON.parse(readFileSync(kpPath, 'utf-8'))
if (!Array.isArray(secretArr) || secretArr.length !== 64) {
  throw new Error('keypair file is not a 64-byte secret-key array')
}

// ── Generate the relayer shared token once, reuse if already set locally ──
const token = local.VITE_RELAYER_TOKEN || randomBytes(32).toString('hex')

const PUBLIC_URL = 'https://p01--vanta-mobile--9ymc8tqmdxvj.code.run'

const runtimeEnvironment = {
  NODE_ENV: 'production',
  RELAYER_PORT: '3001',
  CORS_ORIGINS: 'https://appassets.androidplatform.net',
  RELAYER_TOKEN: token,
  RELAYER_KEYPAIR: JSON.stringify(secretArr),
  DATABASE_URL: local.DATABASE_URL,
  SOLANA_RPC_URL: `https://devnet.helius-rpc.com/?api-key=${local.VITE_HELIUS_API_KEY}`,
}

writeFileSync('/tmp/nf-patch.json', JSON.stringify({ runtimeEnvironment }), { mode: 0o600 })
console.log('payload keys:', Object.keys(runtimeEnvironment).join(', '))

// ── Sync the two client vars into .env.local for the APK build ──
let next = envText
function setVar(text, key, value) {
  const re = new RegExp(`^\\s*${key}\\s*=.*$`, 'm')
  return re.test(text) ? text.replace(re, `${key}=${value}`) : text.trimEnd() + `\n${key}=${value}\n`
}
next = setVar(next, 'VITE_RELAYER_URL', PUBLIC_URL)
next = setVar(next, 'VITE_RELAYER_TOKEN', token)
writeFileSync(join(root, '.env.local'), next, { mode: 0o600 })
console.log('VITE_RELAYER_URL ->', PUBLIC_URL)
console.log('VITE_RELAYER_TOKEN -> set (len ' + token.length + ')')
