// git 以外のシェルコマンド：cd / pwd / ls / cat / echo / touch / mkdir / rm / mv / cp。
// ファイルはワークスペースの files（ルートからの相対パス）にある。フォルダはファイルのパスから決まる。
// ワークスペースの直下に別のワークスペース（clone したフォルダなど）があれば、それもフォルダとして見せる。
import { own } from '../model/dict.ts'
import { addWorkspaceTo, basename, findWorkspace, parentPath, resolvePath } from '../model/paths.ts'
import type { FilePath, Workspace } from '../model/types.ts'
import { abort, type Cmd, fail } from './context.ts'

/** 入力されたパスを、ワークスペースのルートからの相対パスにする（'' はルート） */
const rel = (name: string): FilePath => resolvePath('/', name).slice(1)

/** ワークスペースの直下にある、別のワークスペース（フォルダ） */
function childWorkspaces(cmd: Cmd): Workspace[] {
  const here = resolvePath('/', cmd.ws.path)
  return Object.values(cmd.world.workspaces).filter(
    (ws) => ws !== cmd.ws && parentPath(ws.path) === here,
  )
}

const isFile = (cmd: Cmd, path: FilePath) => own(cmd.ws.files, path) !== undefined
const isDir = (cmd: Cmd, path: FilePath) =>
  path === '' ||
  Object.keys(cmd.ws.files).some((f) => f.startsWith(`${path}/`)) ||
  (!path.includes('/') && childWorkspaces(cmd).some((ws) => basename(ws.path) === path))
const parentExists = (cmd: Cmd, path: FilePath) =>
  !path.includes('/') || isDir(cmd, path.slice(0, path.lastIndexOf('/')))

function entries(cmd: Cmd, dir: FilePath, all: boolean): string[] {
  const prefix = dir === '' ? '' : `${dir}/`
  const names = new Set<string>()
  for (const path of Object.keys(cmd.ws.files)) {
    if (path.startsWith(prefix)) names.add(path.slice(prefix.length).split('/')[0] as string)
  }
  if (dir === '') {
    for (const ws of childWorkspaces(cmd)) names.add(basename(ws.path))
    if (all && cmd.ws.git && !cmd.ws.git.bare) names.add('.git')
  }
  return [...names].filter((n) => all || !n.startsWith('.')).sort()
}

/** フラグ（-rf など）と、それ以外の引数に分ける */
function split(args: string[]): { flags: Set<string>; rest: string[] } {
  const flags = new Set<string>()
  const rest: string[] = []
  let ended = false
  for (const a of args) {
    if (!ended && a === '--') ended = true
    else if (!ended && /^-[A-Za-z]+$/.test(a)) for (const ch of a.slice(1)) flags.add(ch)
    else rest.push(a)
  }
  return { flags, rest }
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
      if (!hit) {
        // ワークスペースの中のフォルダには入れない（git のコマンドはルートで実行する作り）
        if (isDir(cmd, rel(arg))) {
          fail(
            cmd,
            `git-sensei: リポジトリの中のフォルダ（${arg}）には cd できません。ここ（ルート）のまま、${arg}/ファイル名 のように指定してください`,
            1,
          )
        }
        fail(cmd, `cd: ${arg}: No such file or directory`, 1)
      }
      cmd.cwd = hit[0]
      return true
    }
    case 'ls': {
      const { flags, rest } = split(args)
      const all = flags.has('a')
      const targets = rest.length > 0 ? rest : ['.']
      for (const [i, t] of targets.entries()) {
        const path = rel(t)
        if (isFile(cmd, path)) {
          cmd.out.push(t)
          continue
        }
        if (!isDir(cmd, path)) fail(cmd, `ls: cannot access '${t}': No such file or directory`, 2)
        if (targets.length > 1) cmd.out.push(`${i > 0 ? '\n' : ''}${t}:`)
        cmd.out.push(entries(cmd, path, all).join('  '))
      }
      return true
    }
    case 'cat': {
      if (args.length === 0) fail(cmd, 'cat: ファイル名を指定してください', 1)
      for (const name of args) {
        const content = own(cmd.ws.files, rel(name))
        if (content === undefined) {
          fail(
            cmd,
            isDir(cmd, rel(name))
              ? `cat: ${name}: Is a directory`
              : `cat: ${name}: No such file or directory`,
            1,
          )
        }
        if (content !== '') cmd.out.push(content.replace(/\n$/, ''))
      }
      return true
    }
    case 'echo':
      cmd.out.push(args.join(' '))
      return true
    case 'touch': {
      if (args.length === 0) fail(cmd, 'touch: missing file operand', 1)
      for (const name of args) {
        const path = rel(name)
        if (isFile(cmd, path) || isDir(cmd, path)) continue
        if (!parentExists(cmd, path)) {
          fail(cmd, `touch: cannot touch '${name}': No such file or directory`, 1)
        }
        cmd.ws.files[path] = ''
      }
      return true
    }
    case 'mkdir': {
      const { flags, rest } = split(args)
      if (rest.length === 0) fail(cmd, 'mkdir: missing operand', 1)
      for (const name of rest) {
        const path = rel(name)
        if (isFile(cmd, path) || (isDir(cmd, path) && !flags.has('p'))) {
          fail(cmd, `mkdir: cannot create directory '${name}': File exists`, 1)
        }
        if (isDir(cmd, path)) continue
        if (!cmd.ws.git && !path.includes('/')) {
          // リポジトリの外（ホームなど）：新しいフォルダとして作る。cd で入って git init できる
          addWorkspaceTo(cmd.world, resolvePath(cmd.ws.path, path))
        } else {
          cmd.err.push(
            `git-sensei: 空のフォルダ ${name} は、まだ見えません。中にファイルを作ると現れます（git も空のフォルダは記録しません）`,
          )
        }
      }
      return true
    }
    case 'rm': {
      const { flags, rest } = split(args)
      const recursive = flags.has('r') || flags.has('R')
      const force = flags.has('f')
      if (rest.length === 0 && !force) fail(cmd, 'rm: missing operand', 1)
      let failed = false
      for (const name of rest) {
        const path = rel(name)
        if (path === '.git' && cmd.ws.git && !cmd.ws.git.bare) {
          if (!recursive) {
            cmd.err.push(`rm: cannot remove '${name}': Is a directory`)
            failed = true
            continue
          }
          // .git を消すと、履歴ごとなくなる（作業ツリーのファイルだけが残る）
          cmd.ws.git = null
          continue
        }
        if (isFile(cmd, path)) {
          delete cmd.ws.files[path]
          continue
        }
        if (isDir(cmd, path) && path !== '') {
          if (!recursive) {
            cmd.err.push(`rm: cannot remove '${name}': Is a directory`)
            failed = true
            continue
          }
          for (const f of Object.keys(cmd.ws.files)) {
            if (f.startsWith(`${path}/`)) delete cmd.ws.files[f]
          }
          // 直下のワークスペース（clone したフォルダなど）なら、まるごと消す
          const target = resolvePath(cmd.ws.path, path)
          for (const [key, ws] of Object.entries(cmd.world.workspaces)) {
            const p = resolvePath('/', ws.path)
            if (p === target || p.startsWith(`${target}/`)) delete cmd.world.workspaces[key]
          }
          continue
        }
        if (!force) {
          cmd.err.push(`rm: cannot remove '${name}': No such file or directory`)
          failed = true
        }
      }
      if (failed) abort(1)
      return true
    }
    case 'mv':
    case 'cp': {
      const { flags, rest } = split(args)
      if (rest.length !== 2) {
        fail(
          cmd,
          `${program}: ${rest.length < 2 ? 'missing file operand' : 'ファイルは1つずつ指定してください'}`,
          1,
        )
      }
      const [srcName, dstName] = rest as [string, string]
      const src = rel(srcName)
      let dst = rel(dstName)
      if (!isFile(cmd, src) && !isDir(cmd, src)) {
        fail(cmd, `${program}: cannot stat '${srcName}': No such file or directory`, 1)
      }
      if (isDir(cmd, dst)) dst = dst === '' ? basename(src) : `${dst}/${basename(src)}`
      if (!parentExists(cmd, dst)) {
        fail(
          cmd,
          `${program}: cannot ${program === 'mv' ? 'move' : 'create regular file'} '${dstName}': No such file or directory`,
          1,
        )
      }
      if (src === dst) fail(cmd, `${program}: '${srcName}' and '${dstName}' are the same file`, 1)
      if (isFile(cmd, src)) {
        cmd.ws.files[dst] = cmd.ws.files[src] as string
        if (program === 'mv') delete cmd.ws.files[src]
        return true
      }
      if (program === 'cp' && !flags.has('r') && !flags.has('R')) {
        fail(cmd, `cp: -r not specified; omitting directory '${srcName}'`, 1)
      }
      for (const f of Object.keys(cmd.ws.files)) {
        if (!f.startsWith(`${src}/`)) continue
        cmd.ws.files[`${dst}${f.slice(src.length)}`] = cmd.ws.files[f] as string
        if (program === 'mv') delete cmd.ws.files[f]
      }
      return true
    }
    default:
      return false
  }
}
