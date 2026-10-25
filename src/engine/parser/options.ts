// git のオプション解析（parse-options 相当の最小限）。
// -m msg / -mmsg / --message=msg / --message msg / 短いフラグの連結（-am msg）/ -- に対応する。

export interface OptionSpec {
  /** 正規化した名前（結果のキー） */
  name: string
  short?: string
  long?: string[]
  /** 値を取るか */
  value?: boolean
  /** 同じオプションを複数回指定できるか（値は配列にたまる） */
  multiple?: boolean
}

export interface ParsedArgs {
  flags: Set<string>
  values: Map<string, string[]>
  positionals: string[]
}

export type ParseResult = { ok: true; args: ParsedArgs } | { ok: false; error: string }

/** -3 のような数字だけの短いオプション（log -3）を許すか */
export interface ParseOptions {
  numericShorthand?: string
}

export function parseArgs(
  argv: string[],
  specs: OptionSpec[],
  opts: ParseOptions = {},
): ParseResult {
  const flags = new Set<string>()
  const values = new Map<string, string[]>()
  const positionals: string[] = []
  const byShort = new Map(specs.filter((s) => s.short).map((s) => [s.short as string, s]))
  const byLong = new Map(specs.flatMap((s) => (s.long ?? []).map((l) => [l, s] as const)))

  const set = (spec: OptionSpec, value?: string) => {
    if (spec.value) {
      const list = values.get(spec.name) ?? []
      if (spec.multiple) list.push(value as string)
      else list.splice(0, list.length, value as string)
      values.set(spec.name, list)
    } else flags.add(spec.name)
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1))
      break
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=')
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      const negated = name.startsWith('no-') ? byLong.get(name.slice(3)) : undefined
      const spec = byLong.get(name)
      if (!spec) {
        if (negated && !negated.value) {
          flags.delete(negated.name)
          continue
        }
        return { ok: false, error: `error: unknown option \`${name}'` }
      }
      if (spec.value) {
        const value = eq === -1 ? argv[++i] : arg.slice(eq + 1)
        if (value === undefined)
          return { ok: false, error: `error: option \`${name}' requires a value` }
        set(spec, value)
      } else {
        if (eq !== -1) return { ok: false, error: `error: option \`${name}' takes no value` }
        set(spec)
      }
      continue
    }
    if (arg.startsWith('-') && arg.length > 1) {
      if (opts.numericShorthand && /^-\d+$/.test(arg)) {
        values.set(opts.numericShorthand, [arg.slice(1)])
        continue
      }
      for (let j = 1; j < arg.length; j++) {
        const ch = arg[j] as string
        const spec = byShort.get(ch)
        if (!spec) return { ok: false, error: `error: unknown switch \`${ch}'` }
        if (spec.value) {
          const rest = arg.slice(j + 1)
          const value = rest !== '' ? rest : argv[++i]
          if (value === undefined)
            return { ok: false, error: `error: switch \`${ch}' requires a value` }
          set(spec, value)
          break
        }
        set(spec)
      }
      continue
    }
    positionals.push(arg)
  }
  return { ok: true, args: { flags, values, positionals } }
}
