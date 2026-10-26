// git config（値の読み書き）。--global は world 全体、それ以外はリポジトリごとの設定。
import { has, own } from '../model/dict.ts'
import { parseArgs } from '../parser/options.ts'
import { type Cmd, exitKeep, fail } from './context.ts'

/** セクション名と最後のキーは大文字小文字を区別しない（branch.Feature.remote の中間は区別する） */
export function normalizeKey(key: string): string | null {
  const parts = key.split('.')
  if (parts.length < 2 || parts.some((p) => p === '')) return null
  const first = (parts[0] as string).toLowerCase()
  const last = (parts[parts.length - 1] as string).toLowerCase()
  return [first, ...parts.slice(1, -1), last].join('.')
}

export function config(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'global', long: ['global'] },
    { name: 'local', long: ['local'] },
    { name: 'unset', long: ['unset'] },
    { name: 'list', short: 'l', long: ['list'] },
    { name: 'get', long: ['get'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, positionals } = parsed.args
  const global = flags.has('global')
  const local = cmd.ws.git?.config

  if (flags.has('list')) {
    const entries = global
      ? Object.entries(cmd.world.globalConfig)
      : flags.has('local')
        ? Object.entries(local ?? {})
        : [...Object.entries(cmd.world.globalConfig), ...Object.entries(local ?? {})]
    for (const [k, v] of entries) cmd.out.push(`${k}=${v}`)
    return
  }

  const [rawKey, value, ...extra] = positionals
  if (rawKey === undefined || extra.length > 0) fail(cmd, 'error: wrong number of arguments', 129)
  const key = normalizeKey(rawKey)
  if (key === null) fail(cmd, `error: key does not contain a section: ${rawKey}`, 1)

  const target = global ? cmd.world.globalConfig : local
  if (flags.has('unset')) {
    if (!target || !has(target, key)) exitKeep(5)
    delete target[key]
    return
  }
  if (value === undefined || flags.has('get')) {
    const found = global
      ? own(cmd.world.globalConfig, key)
      : flags.has('local')
        ? local && own(local, key)
        : ((local && own(local, key)) ?? own(cmd.world.globalConfig, key))
    if (found === undefined) exitKeep(1)
    cmd.out.push(found)
    return
  }
  if (!target) fail(cmd, 'fatal: not in a git directory')
  target[key] = value
}
