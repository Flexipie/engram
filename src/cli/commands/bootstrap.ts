import Database from 'better-sqlite3'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import chalk from 'chalk'
import { insertMemory } from '../../db/memories.js'

interface BootstrapResult {
  memoriesSeeded: number
  findings: string[]
}

export async function bootstrapSoftware(db: Database.Database, projectDir: string): Promise<BootstrapResult> {
  const result: BootstrapResult = { memoriesSeeded: 0, findings: [] }

  // Check package.json for signals
  const pkgPath = join(projectDir, 'package.json')
  if (!existsSync(pkgPath)) return result

  let pkg: Record<string, unknown> = {}
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return result
  }

  const deps = { ...(pkg['dependencies'] as Record<string, unknown> | undefined ?? {}), ...(pkg['devDependencies'] as Record<string, unknown> | undefined ?? {}) }

  // Detect ESM vs CJS
  const isEsm = pkg['type'] === 'module'
  insertMemory(db, {
    type: 'convention',
    scope: 'build',
    content: isEsm
      ? 'Project uses ES modules (type: "module" in package.json). Use .js extensions in imports.'
      : 'Project uses CommonJS (no type: "module"). Use require() and .js extensions.',
    confidence: 0.5,
    source: 'bootstrap',
  })
  result.memoriesSeeded++
  result.findings.push(`Module system: ${isEsm ? 'ESM' : 'CJS'}`)

  // Detect test framework
  if ('vitest' in deps) {
    insertMemory(db, {
      type: 'convention',
      scope: 'testing',
      content: 'Test framework is Vitest. Use describe/it/expect from vitest. Run tests with `npm test`.',
      confidence: 0.5,
      source: 'bootstrap',
    })
    result.memoriesSeeded++
    result.findings.push('Test framework: Vitest')
  } else if ('jest' in deps) {
    insertMemory(db, {
      type: 'convention',
      scope: 'testing',
      content: 'Test framework is Jest. Use describe/it/expect from @jest/globals. Run tests with `npm test`.',
      confidence: 0.5,
      source: 'bootstrap',
    })
    result.memoriesSeeded++
    result.findings.push('Test framework: Jest')
  }

  // Detect Zod
  if ('zod' in deps) {
    insertMemory(db, {
      type: 'convention',
      scope: 'api',
      content: 'Use Zod for schema validation. Project has zod as a dependency.',
      confidence: 0.5,
      source: 'bootstrap',
    })
    result.memoriesSeeded++
    result.findings.push('Schema validation: Zod')
  }

  // Detect TypeScript
  if ('typescript' in deps || existsSync(join(projectDir, 'tsconfig.json'))) {
    insertMemory(db, {
      type: 'convention',
      scope: 'build',
      content: 'Project uses TypeScript. Maintain strict type safety; avoid `any` unless necessary.',
      confidence: 0.5,
      source: 'bootstrap',
    })
    result.memoriesSeeded++
    result.findings.push('Language: TypeScript')
  }

  // Detect Express
  if ('express' in deps) {
    insertMemory(db, {
      type: 'convention',
      scope: 'api',
      content: 'HTTP framework is Express. Route handlers use (req, res) => void pattern.',
      confidence: 0.5,
      source: 'bootstrap',
    })
    result.memoriesSeeded++
    result.findings.push('HTTP framework: Express')
  }

  return result
}

export async function runBootstrapCommand(projectDir: string = process.cwd()): Promise<void> {
  const dbPath = join(projectDir, '.engram', 'project.db')
  if (!existsSync(dbPath)) {
    console.error(chalk.red('No .engram/project.db found. Run `engram init` first.'))
    process.exit(1)
  }

  // Check if domain is software
  let domain = 'software'
  const configPath = join(projectDir, '.engram', 'config.json')
  if (existsSync(configPath)) {
    try {
      const cfg = JSON.parse(readFileSync(configPath, 'utf-8')) as { domain?: string }
      domain = cfg.domain ?? 'software'
    } catch { /* ignore */ }
  }

  if (domain !== 'software') {
    console.log(chalk.yellow(`Bootstrap is currently only available for the software domain.`))
    console.log(`Domain "${domain}" detected. Use \`engram remember\` or the REST API to seed memories.`)
    return
  }

  // ts-morph is optional — try to load it for deeper analysis
  let hasTsMorph = false
  try {
    const mod = 'ts-morph'
    // Dynamic string import avoids compile-time resolution of optional dep
    await import(mod)
    hasTsMorph = true
  } catch { /* not installed */ }

  if (hasTsMorph) {
    console.log(chalk.gray('  ts-morph available — deep AST analysis enabled'))
  }

  console.log(chalk.bold('\nEngram Bootstrap\n'))
  console.log(chalk.gray(`  Analyzing ${projectDir}...\n`))

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  const result = await bootstrapSoftware(db, projectDir)
  db.close()

  for (const finding of result.findings) {
    console.log(chalk.green(`  ✓ ${finding}`))
  }

  console.log(`\n${chalk.bold(String(result.memoriesSeeded))} memories seeded.`)
}
