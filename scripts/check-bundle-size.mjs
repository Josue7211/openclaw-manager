import { existsSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const distDir = path.join(root, 'frontend/dist/assets')
const maxChunkKb = Number(process.env.MAX_JS_CHUNK_KB ?? 650)
const maxTotalKb = Number(process.env.MAX_TOTAL_JS_KB ?? 7_000)

if (!existsSync(distDir)) {
  console.error('Bundle check failed: frontend/dist/assets is missing. Run npm --prefix frontend run build first.')
  process.exit(1)
}

const chunks = readdirSync(distDir)
  .filter(file => file.endsWith('.js'))
  .map(file => {
    const fullPath = path.join(distDir, file)
    return {
      file,
      kb: statSync(fullPath).size / 1024,
    }
  })
  .sort((a, b) => b.kb - a.kb)

const totalKb = chunks.reduce((sum, chunk) => sum + chunk.kb, 0)
const oversized = chunks.filter(chunk => chunk.kb > maxChunkKb)
const problems = []

if (oversized.length > 0) {
  problems.push(`oversized JS chunks: ${oversized.map(chunk => `${chunk.file} ${chunk.kb.toFixed(1)}KB`).join(', ')}`)
}

if (totalKb > maxTotalKb) {
  problems.push(`total JS ${totalKb.toFixed(1)}KB exceeds ${maxTotalKb}KB`)
}

if (problems.length > 0) {
  console.error('Bundle check failed:')
  for (const problem of problems) console.error(`- ${problem}`)
  console.error('Largest chunks:')
  for (const chunk of chunks.slice(0, 10)) console.error(`- ${chunk.file}: ${chunk.kb.toFixed(1)}KB`)
  process.exit(1)
}

console.log(`Bundle check passed. Total JS ${totalKb.toFixed(1)}KB, largest chunk ${chunks[0]?.kb.toFixed(1) ?? '0.0'}KB.`)
