#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

function readStdin() {
  return new Promise((resolve, reject) => {
    let body = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      body += chunk
    })
    process.stdin.on('end', () => resolve(body))
    process.stdin.on('error', reject)
  })
}

function expandHome(value) {
  if (!value || typeof value !== 'string') return undefined
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return `${homedir()}${value.slice(1)}`
  return value
}

function writeReply(reply) {
  process.stdout.write(`${JSON.stringify(reply)}\n`)
}

function runClaude({ binaryPath, cwd, prompt, homePath }) {
  return new Promise((resolve) => {
    const home = expandHome(homePath)
    const env = {
      ...process.env,
      ...(home ? { HOME: home, CLAUDE_CONTINUATION_GROUP_KEY: `claude:home:${home}` } : {}),
    }
    const child = spawn(binaryPath || 'claude', ['-p', prompt || ''], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })

    child.on('error', error => {
      resolve({
        ok: false,
        error: `Claude Code is not installed or could not be started: ${error.message}`,
      })
    })
    child.on('close', code => {
      if (code === 0) {
        resolve({ ok: true, reply: stdout.trim() })
        return
      }
      resolve({
        ok: false,
        error: `Claude Code exited with ${code ?? 'signal'}${stderr.trim() ? `: ${stderr.trim()}` : ''}`,
      })
    })
  })
}

async function main() {
  try {
    const input = JSON.parse(await readStdin())
    if (input?.type !== 'send') {
      writeReply({ ok: false, error: 'unsupported Claude provider runtime request' })
      return
    }
    const config = input.config || {}
    writeReply(await runClaude({
      binaryPath: config.binaryPath,
      cwd: input.cwd,
      prompt: input.prompt,
      homePath: config.homePath,
    }))
  } catch (error) {
    writeReply({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

main()
