#!/usr/bin/env node
import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const options = {
  stack: resolve(root, 'deploy/portainer/clawcontrol-full.stack.yml'),
  env: resolve(root, '.env.full'),
  allowPlaceholders: false,
  noDocker: false,
  requireDocker: false,
  sshHost: '',
  remoteStack: '',
  remoteEnv: '',
}

function usage() {
  console.log(`Usage: node scripts/check-full-stack-config.mjs [--env .env.full] [--stack path] [--allow-placeholders] [--no-docker] [--require-docker] [--ssh-host host] [--remote-stack path] [--remote-env path]`)
}

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i]
  if (arg === '--help' || arg === '-h') {
    usage()
    process.exit(0)
  }
  if (arg === '--env') {
    options.env = resolve(process.cwd(), process.argv[++i] ?? '')
    continue
  }
  if (arg === '--stack') {
    options.stack = resolve(process.cwd(), process.argv[++i] ?? '')
    continue
  }
  if (arg === '--allow-placeholders') {
    options.allowPlaceholders = true
    continue
  }
  if (arg === '--no-docker') {
    options.noDocker = true
    continue
  }
  if (arg === '--require-docker') {
    options.requireDocker = true
    continue
  }
  if (arg === '--ssh-host') {
    options.sshHost = process.argv[++i] ?? ''
    continue
  }
  if (arg === '--remote-stack') {
    options.remoteStack = process.argv[++i] ?? ''
    continue
  }
  if (arg === '--remote-env') {
    options.remoteEnv = process.argv[++i] ?? ''
    continue
  }
  throw new Error(`Unknown argument: ${arg}`)
}

function fail(message) {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`PASS ${message}`)
}

function warn(message) {
  console.warn(`WARN ${message}`)
}

function readRequired(path, label) {
  if (!existsSync(path)) {
    fail(`${label} not found: ${path}`)
    return ''
  }
  return readFileSync(path, 'utf8')
}

function parseEnv(text) {
  const env = new Map()
  const duplicates = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const key = line.slice(0, line.indexOf('=')).trim()
    const value = line.slice(line.indexOf('=') + 1)
    if (env.has(key)) duplicates.push(key)
    env.set(key, value)
  }
  return { env, duplicates }
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function decodeJwt(token) {
  const [header, payload, sig] = token.split('.')
  if (!header || !payload || !sig) throw new Error('expected three JWT segments')
  const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  return { header, payload, sig, claims: JSON.parse(json) }
}

function checkJwt(env, key, role) {
  const token = env.get(key)
  const secret = env.get('JWT_SECRET')
  if (!token || !secret || token.includes('replace-with') || secret.includes('replace-with')) return
  try {
    const parsed = decodeJwt(token)
    const expectedSig = createHmac('sha256', secret).update(`${parsed.header}.${parsed.payload}`).digest('base64url')
    if (expectedSig !== parsed.sig) {
      fail(`${key} is not signed by JWT_SECRET`)
      return
    }
    if (parsed.claims.role !== role) {
      fail(`${key} role is ${parsed.claims.role}, expected ${role}`)
      return
    }
    pass(`${key} JWT signature and role`)
  } catch (error) {
    fail(`${key} is not a valid JWT: ${error.message}`)
  }
}

const stackText = readRequired(options.stack, 'stack file')
const envText = readRequired(options.env, 'env file')
const { env, duplicates } = parseEnv(envText)

const vars = [...stackText.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])
const needed = [...new Set(vars)].sort()
const missing = needed.filter((key) => !env.has(key))
const extras = [...env.keys()].filter((key) => !needed.includes(key)).sort()
const placeholders = [...env.entries()]
  .filter(([, value]) => /replace-with|your-|changeme/i.test(value))
  .map(([key]) => key)

if (duplicates.length) fail(`duplicate env keys: ${[...new Set(duplicates)].join(', ')}`)
else pass('no duplicate env keys')

if (missing.length) fail(`missing env keys used by stack: ${missing.join(', ')}`)
else pass('all stack variables are covered by env file')

if (placeholders.length && !options.allowPlaceholders) {
  fail(`placeholder values remain: ${placeholders.join(', ')}`)
} else if (placeholders.length) {
  warn(`placeholder values remain: ${placeholders.join(', ')}`)
} else {
  pass('no placeholder values remain')
}

if (extras.length) warn(`env keys not referenced directly by stack: ${extras.join(', ')}`)

checkJwt(env, 'SUPABASE_ANON_KEY', 'anon')
checkJwt(env, 'SUPABASE_SERVICE_ROLE_KEY', 'service_role')

if (!options.noDocker && options.sshHost) {
  let remoteStack = options.remoteStack
  let remoteEnv = options.remoteEnv
  let tempDir = ''
  let remote

  if (!remoteStack || !remoteEnv) {
    const mktemp = spawnSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', options.sshHost, 'mktemp -d /tmp/clawcontrol-stack-check.XXXXXX'],
      { cwd: root, encoding: 'utf8' },
    )
    if (mktemp.status !== 0) {
      fail(`failed to create remote temp dir on ${options.sshHost}:\n${mktemp.stderr || mktemp.stdout}`)
    } else {
      tempDir = mktemp.stdout.trim()
      remoteStack = `${tempDir}/stack.yml`
      remoteEnv = `${tempDir}/stack.env`
      const scp = spawnSync(
        'scp',
        ['-q', options.stack, options.env, `${options.sshHost}:${tempDir}/`],
        { cwd: root, encoding: 'utf8' },
      )
      if (scp.status !== 0) {
        fail(`failed to copy stack/env to ${options.sshHost}:\n${scp.stderr || scp.stdout}`)
      } else {
        const move = spawnSync(
          'ssh',
          [
            '-o',
            'BatchMode=yes',
            '-o',
            'ConnectTimeout=10',
            options.sshHost,
            `mv ${JSON.stringify(`${tempDir}/${options.stack.split('/').pop()}`)} ${JSON.stringify(remoteStack)} && mv ${JSON.stringify(`${tempDir}/${options.env.split('/').pop()}`)} ${JSON.stringify(remoteEnv)}`,
          ],
          { cwd: root, encoding: 'utf8' },
        )
        if (move.status !== 0) {
          fail(`failed to prepare remote temp stack files:\n${move.stderr || move.stdout}`)
        }
      }
    }
  }

  if (!process.exitCode) {
    const script = [
      'set -euo pipefail',
      `test -f ${JSON.stringify(remoteStack)}`,
      `test -f ${JSON.stringify(remoteEnv)}`,
      `docker compose --env-file ${JSON.stringify(remoteEnv)} -f ${JSON.stringify(remoteStack)} config >/dev/null`,
      tempDir ? `rm -rf ${JSON.stringify(tempDir)}` : '',
    ].filter(Boolean).join('\n')
    remote = spawnSync(
      'ssh',
      ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', options.sshHost, script],
      { cwd: root, encoding: 'utf8' },
    )
  }
  if (process.exitCode) {
    if (tempDir) {
      spawnSync('ssh', ['-o', 'BatchMode=yes', options.sshHost, `rm -rf ${JSON.stringify(tempDir)}`], {
        cwd: root,
        encoding: 'utf8',
      })
    }
  } else if (remote.error?.code === 'ENOENT') {
    fail('ssh binary not found; cannot run remote docker compose config')
  } else if (remote.status !== 0) {
    if (tempDir) {
      spawnSync('ssh', ['-o', 'BatchMode=yes', options.sshHost, `rm -rf ${JSON.stringify(tempDir)}`], {
        cwd: root,
        encoding: 'utf8',
      })
    }
    fail(`remote docker compose config failed on ${options.sshHost}:\n${remote.stderr || remote.stdout}`)
  } else {
    pass(`remote docker compose config on ${options.sshHost}`)
  }
} else if (!options.noDocker) {
  const docker = spawnSync('docker', ['compose', '--env-file', options.env, '-f', options.stack, 'config'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (docker.error?.code === 'ENOENT') {
    const message = 'docker binary not found; skipped docker compose config'
    if (options.requireDocker) fail(message)
    else warn(message)
  } else if (docker.status !== 0) {
    fail(`docker compose config failed:\n${docker.stderr || docker.stdout}`)
  } else {
    pass('docker compose config')
  }
}

if (process.exitCode) process.exit(process.exitCode)
