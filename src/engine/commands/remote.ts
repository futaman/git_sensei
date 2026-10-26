import { has, own } from '../model/dict.ts'
import { parseArgs } from '../parser/options.ts'
import { listRemotes, REMOTES } from '../refs.ts'
import { type Cmd, exitKeep, fail, requireRepo, unsupported } from './context.ts'

export function remote(cmd: Cmd, argv: string[]): void {
  const [sub, ...rest] = argv
  const git = requireRepo(cmd)

  if (sub === undefined || sub === '-v' || sub === '--verbose') {
    for (const name of listRemotes(git)) {
      if (sub === undefined) cmd.out.push(name)
      else {
        const url = own(git.config, `remote.${name}.url`)
        cmd.out.push(`${name}\t${url} (fetch)`, `${name}\t${url} (push)`)
      }
    }
    return
  }

  const parsed = parseArgs(rest, [])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const args = parsed.args.positionals

  switch (sub) {
    case 'add': {
      const [name, url] = args
      if (name === undefined || url === undefined || args.length > 2)
        fail(cmd, 'usage: git remote add <name> <url>', 129)
      if (has(git.config, `remote.${name}.url`)) {
        cmd.err.push(`error: remote ${name} already exists.`)
        exitKeep(3)
      }
      git.config[`remote.${name}.url`] = url
      git.config[`remote.${name}.fetch`] = `+refs/heads/*:refs/remotes/${name}/*`
      cmd.events.push({ type: 'REMOTE_ADDED', name, url })
      return
    }
    case 'remove':
    case 'rm': {
      const [name] = args
      if (name === undefined) fail(cmd, 'usage: git remote remove <name>', 129)
      if (!has(git.config, `remote.${name}.url`)) {
        cmd.err.push(`error: No such remote: '${name}'`)
        exitKeep(2)
      }
      for (const key of Object.keys(git.config)) {
        if (key.startsWith(`remote.${name}.`)) delete git.config[key]
      }
      // このリモートを上流にしていたブランチの設定も消す
      for (const [key, value] of Object.entries(git.config)) {
        const m = /^branch\.(.+)\.remote$/.exec(key)
        if (m && value === name) {
          delete git.config[key]
          delete git.config[`branch.${m[1]}.merge`]
        }
      }
      const prefix = `${REMOTES}${name}/`
      for (const ref of Object.keys(git.refs)) if (ref.startsWith(prefix)) delete git.refs[ref]
      for (const ref of Object.keys(git.symrefs))
        if (ref.startsWith(prefix)) delete git.symrefs[ref]
      cmd.events.push({ type: 'REMOTE_REMOVED', name })
      return
    }
    case 'get-url': {
      const [name] = args
      const url = name === undefined ? undefined : own(git.config, `remote.${name}.url`)
      if (url === undefined) {
        cmd.err.push(`error: No such remote '${name ?? ''}'`)
        exitKeep(2)
      }
      cmd.out.push(url)
      return
    }
    default:
      unsupported(cmd, `git remote ${sub}`)
  }
}
