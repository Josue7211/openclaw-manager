#!/usr/bin/env node
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaults = {
  template: resolve(root, 'deploy/portainer/clawcontrol-full.env.example'),
  out: resolve(root, '.env.full'),
  force: false,
  overrides: new Map(),
}

function usage() {
  console.log(`Usage: node scripts/generate-full-stack-env.mjs [--out .env.full] [--template path] [--force] [--set KEY=VALUE]

Generates a first-run full-stack env with strong random secrets and Supabase
anon/service-role JWTs signed by the generated JWT_SECRET.`)
}

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  if (arg === '--help' || arg === '-h') {
    usage()
    process.exit(0)
  }
  if (arg === '--force') {
    defaults.force = true
    continue
  }
  if (arg === '--out') {
    defaults.out = resolve(process.cwd(), process.argv[++i] ?? '')
    continue
  }
  if (arg === '--template') {
    defaults.template = resolve(process.cwd(), process.argv[++i] ?? '')
    continue
  }
  if (arg === '--set') {
    const pair = process.argv[++i] ?? ''
    const idx = pair.indexOf('=')
    if (idx <= 0) throw new Error(`Invalid --set value: ${pair}`)
    defaults.overrides.set(pair.slice(0, idx), pair.slice(idx + 1))
    continue
  }
  throw new Error(`Unknown argument: ${arg}`)
}

if (!existsSync(defaults.template)) {
  throw new Error(`Template not found: ${defaults.template}`)
}
if (existsSync(defaults.out) && !defaults.force) {
  throw new Error(`Refusing to overwrite ${defaults.out}. Pass --force to replace it.`)
}

function hex(bytes = 32) {
  return randomBytes(bytes).toString('hex')
}

function b64(bytes = 48) {
  return randomBytes(bytes).toString('base64')
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function signJwt(secret, role) {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    iss: 'supabase',
    ref: 'clawcontrol',
    role,
    iat: now,
    exp: now + 60 * 60 * 24 * 365 * 10,
  }
  const body = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`
  const sig = createHmac('sha256', secret).update(body).digest('base64url')
  return `${body}.${sig}`
}

const generated = new Map()
generated.set('POSTGRES_PASSWORD', hex())
generated.set('JWT_SECRET', hex())
generated.set('REALTIME_SECRET_KEY_BASE', b64())
generated.set('PAIRING_TOKEN', hex())
generated.set('MC_AGENT_KEY', hex())
generated.set('SECRET_BROKER_CLIENT_API_KEY', hex())
generated.set('SECRET_BROKER_APPROVER_API_KEY', hex())
generated.set('AGENTSECRETS_CLIENT_API_KEY', generated.get('SECRET_BROKER_CLIENT_API_KEY'))
generated.set('SUPABASE_ANON_KEY', signJwt(generated.get('JWT_SECRET'), 'anon'))
generated.set('SUPABASE_SERVICE_ROLE_KEY', signJwt(generated.get('JWT_SECRET'), 'service_role'))

for (const [key, value] of defaults.overrides.entries()) {
  generated.set(key, value)
}

const replaced = []
const output = readFileSync(defaults.template, 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) return line
    const key = line.slice(0, line.indexOf('='))
    if (!generated.has(key)) return line
    replaced.push(key)
    return `${key}=${generated.get(key)}`
  })
  .join('\n')

writeFileSync(defaults.out, output.endsWith('\n') ? output : `${output}\n`, { mode: 0o600 })

console.log(`Wrote ${defaults.out}`)
console.log(`Generated ${replaced.length} secret values:`)
for (const key of replaced.sort()) {
  console.log(`- ${key}`)
}
console.log('\nKeep this file private. Do not commit it.')
