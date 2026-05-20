import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const knipBin = path.join(root, 'frontend/node_modules/knip/bin/knip.js')

const baseline = {
  files: 0,
  dependencies: 0,
  devDependencies: 0,
  unlisted: 0,
  exports: 139,
  types: 113,
  duplicates: 0,
  unresolved: 0,
  binaries: 0,
  catalog: 0,
  enumMembers: 0,
  namespaceMembers: 0,
  nsExports: 0,
  nsTypes: 0,
}

const issueTypes = Object.keys(baseline)
const ignoredUnusedFilePatterns = [
  /^src\/features\/[^/]+\/index\.ts$/,
]

if (!existsSync(knipBin)) {
  console.error('Dead-code check failed: frontend dependencies are not installed; missing knip binary.')
  process.exit(1)
}

const result = spawnSync(process.execPath, [knipBin, '--directory', 'frontend', '--reporter', 'json', '--no-exit-code'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
})

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.stdout.write(result.stdout)
  console.error(`Dead-code check failed: knip exited with status ${result.status}.`)
  process.exit(result.status ?? 1)
}

let report
try {
  report = JSON.parse(result.stdout)
} catch {
  process.stderr.write(result.stderr)
  process.stdout.write(result.stdout)
  console.error('Dead-code check failed: unable to parse knip JSON output.')
  process.exit(1)
}

const counts = Object.fromEntries(issueTypes.map(type => [type, 0]))
for (const issue of report.issues ?? []) {
  for (const type of issueTypes) {
    if (!Array.isArray(issue[type])) continue
    const entries = type === 'files'
      ? issue[type].filter(entry => {
          const name = typeof entry?.name === 'string' ? entry.name : ''
          return !ignoredUnusedFilePatterns.some(pattern => pattern.test(name))
        })
      : issue[type]
    counts[type] += entries.length
  }
}

const regressions = issueTypes.filter(type => counts[type] > baseline[type])
if (regressions.length > 0) {
  console.error('Dead-code check failed: knip issue count exceeded the cleanup baseline.')
  for (const type of regressions) {
    console.error(`- ${type}: ${counts[type]} > ${baseline[type]}`)
  }
  process.exit(1)
}

const total = Object.values(counts).reduce((sum, count) => sum + count, 0)
const baselineTotal = Object.values(baseline).reduce((sum, count) => sum + count, 0)
console.log(`Dead-code baseline check passed. Knip issues ${total}/${baselineTotal}.`)
