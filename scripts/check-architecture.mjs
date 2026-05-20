import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const ignoredDirs = new Set([
  '.git',
  '.cargo-target',
  'node_modules',
  'dist',
  'target',
  '.vite',
  '.vitest',
  '.pytest_cache',
])

const requiredFiles = [
  '.git/HEAD',
  '.git/config',
  'package.json',
  'frontend/package.json',
  'frontend/package-lock.json',
  'frontend/index.html',
  'frontend/tsconfig.json',
  'frontend/vite.config.ts',
  'frontend/src/main.tsx',
  'frontend/src/App.tsx',
  'src-tauri/Cargo.toml',
  'src-tauri/tauri.conf.json',
  'src-tauri/src/lib.rs',
  'src-tauri/src/main.rs',
  'src-tauri/src/bin/clawcontrol-backend.rs',
]

const reusableLayerPrefixes = [
  'frontend/src/chat/',
  'frontend/src/components/',
  'frontend/src/features/',
  'frontend/src/hooks/',
  'frontend/src/lib/',
]

const problems = []
const maxSourceBytes = 260 * 1024
const maxPageBytes = 240 * 1024
const maxUnbaselinedPageLines = 1200
const pageLineBaselines = new Map(Object.entries({
  'frontend/src/pages/notes/Notes.tsx': 6731,
  'frontend/src/pages/Training.tsx': 3799,
  'frontend/src/pages/JobHunter.tsx': 3549,
  'frontend/src/pages/MediaRadar.tsx': 3242,
  'frontend/src/pages/HomeLab.tsx': 1883,
  'frontend/src/pages/settings/SettingsModules.tsx': 1852,
  'frontend/src/pages/Email.tsx': 1448,
  'frontend/src/pages/Chat.tsx': 1273,
  'frontend/src/pages/notes/FileTree.tsx': 1259,
  'frontend/src/pages/settings/SettingsConnections.tsx': 1255,
  'frontend/src/pages/Memory.tsx': 1240,
  'frontend/src/pages/Messages.tsx': 1201,
}))

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/')
}

function shouldSkipDir(name, fullPath) {
  if (ignoredDirs.has(name)) return true
  const relative = rel(fullPath)
  return relative.startsWith('frontend/node_modules') ||
    relative.startsWith('frontend/dist') ||
    relative.startsWith('src-tauri/target')
}

function walk(dir, visit) {
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      if (shouldSkipDir(entry, fullPath)) continue
      walk(fullPath, visit)
      visit(fullPath, stats)
    } else {
      visit(fullPath, stats)
    }
  }
}

for (const required of requiredFiles) {
  if (!existsSync(path.join(root, required))) {
    problems.push(`missing required project file: ${required}`)
  }
}

walk(root, (fullPath, stats) => {
  const relative = rel(fullPath)
  const name = path.basename(fullPath)

  if (name.startsWith('._')) {
    problems.push(`AppleDouble metadata file: ${relative}`)
  }

  if (stats.isDirectory()) {
    const entries = readdirSync(fullPath).filter(entry => !entry.startsWith('._'))
    if (entries.length === 0) {
      problems.push(`empty directory: ${relative}`)
    }
    return
  }

  if (!relative.startsWith('frontend/src/') || !/\.[tj]sx?$/.test(relative)) {
    return
  }

  if (stats.size > maxSourceBytes) {
    problems.push(`${relative} is ${(stats.size / 1024).toFixed(1)}KB; split files above ${maxSourceBytes / 1024}KB`)
  }

  if (relative.startsWith('frontend/src/pages/') && stats.size > maxPageBytes) {
    problems.push(`${relative} is ${(stats.size / 1024).toFixed(1)}KB; page files above ${maxPageBytes / 1024}KB should move domain logic to features`)
  }

  const inReusableLayer = reusableLayerPrefixes.some(prefix => relative.startsWith(prefix))
  const source = readFileSync(fullPath, 'utf8')

  if (relative.startsWith('frontend/src/pages/') && !relative.includes('/__tests__/')) {
    const lineCount = source.endsWith('\n') ? source.split('\n').length - 1 : source.split('\n').length
    const baseline = pageLineBaselines.get(relative)
    if (typeof baseline === 'number' && lineCount > baseline) {
      problems.push(`${relative} grew from ${baseline} to ${lineCount} lines; extract page logic into features before adding more`)
    }
    if (typeof baseline !== 'number' && lineCount > maxUnbaselinedPageLines) {
      problems.push(`${relative} has ${lineCount} lines; page files above ${maxUnbaselinedPageLines} lines need an explicit baseline or extraction`)
    }
  }

  if (relative.startsWith('frontend/src/features/')) {
    const [, featureName] = relative.match(/^frontend\/src\/features\/([^/]+)\//) ?? []
    if (featureName && !existsSync(path.join(root, 'frontend/src/features', featureName, 'index.ts'))) {
      problems.push(`feature ${featureName} is missing index.ts`)
    }
  }

  if (relative.startsWith('frontend/src/pages/') && !relative.includes('/__tests__/')) {
    const forbiddenPageShimImports = [
      '@/pages/job-hunter-domain',
      '@/pages/job-hunter-types',
      '@/pages/growth-ops-domain',
    ]
    for (const specifier of forbiddenPageShimImports) {
      if (source.includes(specifier)) {
        problems.push(`${relative} imports migration shim ${specifier}; use features/* directly`)
      }
    }
  }

  if (!inReusableLayer) return

  const importPattern = /(?:from\s+['"]|import\s*\(\s*['"])(@\/pages\/[^'"]+)/g
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1]
    problems.push(`${relative} imports page-owned module ${specifier}`)
  }
})

if (problems.length > 0) {
  console.error('Architecture check failed:')
  for (const problem of problems) {
    console.error(`- ${problem}`)
  }
  process.exit(1)
}

console.log('Architecture check passed.')
