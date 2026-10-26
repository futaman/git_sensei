// git 以外の最小限のシェルコマンド（cd / pwd / ls / cat）。clone したフォルダに入るために使う。
import { findWorkspace, parentPath, resolvePath } from '../model/paths.ts'
import { type Cmd, fail } from './context.ts'

function entries(cmd: Cmd, all: boolean): string[] {
  const names = new Set<string>()
  for (const path of Object.keys(cmd.ws.files)) names.add(path.split('/')[0] as string)
  for (const ws of Object.values(cmd.world.workspaces)) {
    if (ws !== cmd.ws && parentPath(ws.path) === resolvePath('/', cmd.ws.path)) {
      names.add(ws.path.split('/').pop() as string)
    }
  }
  if (all && cmd.ws.git && !cmd.ws.git.bare) names.add('.git')
  return [...names].filter((n) => all || !n.startsWith('.')).sort()
}

export function shell(cmd: Cmd, program: string, args: string[]): boolean {
  switch (program) {
    case 'pwd':
      cmd.out.push(cmd.ws.path)
      return true
    case 'cd': {
      const arg = args[0] ?? '~'
      const home = cmd.ctx.home ?? '/'
      const target =
        arg === '~'
          ? home
          : arg.startsWith('~/')
            ? resolvePath(home, arg.slice(2))
            : resolvePath(cmd.ws.path, arg)
      const hit = findWorkspace(cmd.world, target)
      if (!hit) fail(cmd, `cd: ${arg}: No such file or directory`, 1)
      cmd.cwd = hit[0]
      return true
    }
    case 'ls': {
      const all = args.some((a) => /^-\w*a/.test(a))
      cmd.out.push(entries(cmd, all).join('  '))
      return true
    }
    case 'cat': {
      if (args.length === 0) fail(cmd, 'cat: ファイル名を指定してください', 1)
      for (const name of args) {
        const content = cmd.ws.files[resolvePath('/', name).slice(1)]
        if (content === undefined) fail(cmd, `cat: ${name}: No such file or directory`, 1)
        cmd.out.push(content.replace(/\n$/, ''))
      }
      return true
    }
    default:
      return false
  }
}
