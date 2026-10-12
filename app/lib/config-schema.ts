// app/lib/config-schema.ts
// soii.config.yml validation (spec §6.2). Errors name the YAML path, e.g.
// `soii.config.yml: workspaces[1].tabs[0].view: "galery" is not one of …`.
import { z } from 'zod'
import { VIEW_NAMES, type SoiiConfig } from './types'

export class ConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(issues.join('\n'))
    this.name = 'ConfigError'
  }
}

const scalar = z.union([z.string(), z.number(), z.boolean()])
const EMPTY_LIST = 'must not be empty: an empty list matches no notes'
const oneOrMany = <T extends z.ZodType>(item: T) => z.union([item, z.array(item).min(1, EMPTY_LIST)])
const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits and dashes')

export const queryClauseSchema = z
  .object({
    type: oneOrMany(z.string()).optional(),
    path: oneOrMany(z.string()).optional(),
    tag: oneOrMany(z.string()).optional(),
    where: z.record(z.string(), oneOrMany(scalar)).optional()
  })
  .strict()

export const querySchema = z.union([queryClauseSchema, z.array(queryClauseSchema).min(1, EMPTY_LIST)])

export const tabSchema = z
  .object({
    id,
    title: z.string().min(1),
    icon: z.string().optional(),
    view: z.enum(VIEW_NAMES),
    query: querySchema,
    sort: z.array(z.object({ field: z.string().min(1), dir: z.enum(['asc', 'desc']) }).strict()).optional(),
    limit: z.number().int().positive().optional(),
    options: z.record(z.string(), z.unknown()).optional()
  })
  .strict()

export const workspaceSchema = z
  .object({
    id,
    title: z.string().min(1),
    icon: z.string().optional(),
    theme: z.object({ font: z.string().optional(), accent: z.string().optional(), radius: z.string().optional() }).strict().optional(),
    tabs: z.array(tabSchema).min(1)
  })
  .strict()

function uniqueIds(workspaces: { id: string; tabs: { id: string }[] }[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>()
  workspaces.forEach((ws, i) => {
    if (seen.has(ws.id)) ctx.addIssue({ code: 'custom', path: ['workspaces', i, 'id'], message: `duplicate workspace id "${ws.id}"` })
    seen.add(ws.id)
    const tabs = new Set<string>()
    ws.tabs.forEach((tab, j) => {
      if (tabs.has(tab.id)) {
        ctx.addIssue({ code: 'custom', path: ['workspaces', i, 'tabs', j, 'id'], message: `duplicate tab id "${tab.id}" in workspace "${ws.id}"` })
      }
      tabs.add(tab.id)
    })
  })
}

export const soiiConfigSchema = z
  .object({
    title: z.string().min(1),
    home: z.string(),
    exclude: z.array(z.string()),
    types: z.record(z.string(), z.array(z.string())),
    workspaces: z.array(workspaceSchema),
    obsidianVault: z.string().min(1).optional()
  })
  .strict()
  .superRefine((config, ctx) => uniqueIds(config.workspaces, ctx))

export const userConfigSchema = z
  .object({
    title: z.string().min(1).optional(),
    home: z.string().optional(),
    exclude: z.array(z.string()).optional(),
    types: z.record(z.string(), z.array(z.string())).optional(),
    workspaces: z.array(workspaceSchema).optional(),
    obsidianVault: z.string().min(1).optional(),
    replaceDefaultWorkspaces: z.boolean().optional()
  })
  .strict()
  .superRefine((config, ctx) => uniqueIds(config.workspaces ?? [], ctx))

export type UserConfig = z.infer<typeof userConfigSchema>

type Issue = z.core.$ZodIssue

function pathString(path: PropertyKey[]): string {
  return path.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? String(seg) : `.${String(seg)}`)).join('')
}

function valueAt(data: unknown, path: PropertyKey[]): unknown {
  let current = data
  for (const seg of path) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<PropertyKey, unknown>)[seg]
  }
  return current
}

function describeIssue(issue: Issue, data: unknown, prefix: PropertyKey[] = []): string {
  const path = [...prefix, ...issue.path]
  if (issue.code === 'invalid_union' && issue.errors.length) {
    // Report the branch that got furthest — the one the user most likely meant. On a tie,
    // a type mismatch ("expected string, got []") is the less specific of the two.
    const best = issue.errors
      .map(branch => branch[0])
      .filter((i): i is Issue => Boolean(i))
      .sort((a, b) => b.path.length - a.path.length || Number(a.code === 'invalid_type') - Number(b.code === 'invalid_type'))[0]
    if (best) return describeIssue(best, data, path)
  }
  let message = issue.message
  const value = valueAt(data, path)
  if (issue.code === 'invalid_value') message = `${JSON.stringify(value)} is not one of ${issue.values.join(', ')}`
  else if (issue.code === 'unrecognized_keys') message = `unknown key${issue.keys.length > 1 ? 's' : ''} ${issue.keys.map(k => `"${k}"`).join(', ')}`
  else if (issue.code === 'invalid_type') message = value === undefined ? 'is required' : `expected ${issue.expected}, got ${JSON.stringify(value)}`
  const where = pathString(path)
  return `soii.config.yml: ${where ? `${where}: ` : ''}${message}`
}

function check<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (result.success) return result.data
  throw new ConfigError(result.error.issues.map(issue => describeIssue(issue, data)))
}

export function validateUserConfig(raw: unknown): UserConfig {
  return check(userConfigSchema, raw ?? {})
}

export function validateConfig(config: unknown): SoiiConfig {
  return check(soiiConfigSchema, config) as SoiiConfig
}
