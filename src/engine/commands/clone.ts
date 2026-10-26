import { basename, emptyGitDir, findWorkspace, resolvePath } from '../model/paths.ts'
import { commitTree } from '../objects/store.ts'
import { parseArgs } from '../parser/options.ts'
import { branchRef, currentBranch, HEADS, REMOTES, setUpstream } from '../refs.ts'
import { copyObjects } from '../remote/transfer.ts'
import { switchTrees } from '../worktree/checkout.ts'
import { type Cmd, fail, unsupported } from './context.ts'

export function clone(cmd: Cmd, argv: string[]): void {
  const parsed = parseArgs(argv, [
    { name: 'quiet', short: 'q', long: ['quiet'] },
    { name: 'branch', short: 'b', long: ['branch'], value: true },
    { name: 'bare', long: ['bare'] },
  ])
  if (!parsed.ok) fail(cmd, parsed.error, 129)
  const { flags, values, positionals } = parsed.args
  if (flags.has('bare')) unsupported(cmd, 'git clone --bare')
  if (values.has('branch')) unsupported(cmd, 'git clone -b')
  const [url, dir, ...extra] = positionals
  if (url === undefined) fail(cmd, 'fatal: You must specify a repository to clone.', 129)
  if (extra.length > 0) fail(cmd, 'fatal: Too many arguments.', 129)

  const srcPath = resolvePath(cmd.ws.path, url)
  const src = findWorkspace(cmd.world, srcPath)?.[1]
  if (!src?.git) fail(cmd, `fatal: repository '${url}' does not exist`)
  const srcGit = src.git

  const dirName = dir ?? basename(srcPath).replace(/\.git$/, '')
  const destPath = resolvePath(cmd.ws.path, dirName)
  const existing = findWorkspace(cmd.world, destPath)
  if (existing && (existing[1].git || Object.keys(existing[1].files).length > 0)) {
    fail(cmd, `fatal: destination path '${dirName}' already exists and is not an empty directory.`)
  }
  if (Object.keys(cmd.ws.files).some((f) => f === dirName || f.startsWith(`${dirName}/`))) {
    fail(cmd, `fatal: destination path '${dirName}' already exists and is not an empty directory.`)
  }

  const quiet = flags.has('quiet')
  if (!quiet) cmd.err.push(`Cloning into '${dirName}'...`)

  const srcHead = currentBranch(srcGit) ?? 'main'
  const git = emptyGitDir(srcHead, false)
  // ローカルのパスは絶対パスで記録される（git と同じ）
  git.config['remote.origin.url'] = srcPath
  git.config['remote.origin.fetch'] = '+refs/heads/*:refs/remotes/origin/*'

  const branches = Object.entries(srcGit.refs).filter(([ref]) => ref.startsWith(HEADS))
  copyObjects(
    srcGit,
    git,
    branches.map(([, oid]) => oid),
  )
  for (const [ref, oid] of branches) git.refs[`${REMOTES}origin/${ref.slice(HEADS.length)}`] = oid

  const key = existing?.[0] ?? destPath
  const ws = existing?.[1] ?? { path: destPath, files: {}, git: null }
  cmd.world.workspaces[key] = ws
  ws.git = git

  const headOid = srcGit.refs[branchRef(srcHead)]
  // 空のリポジトリでも、まだないブランチを上流として設定しておく（git と同じ）
  setUpstream(git, srcHead, 'origin', srcHead)
  if (headOid) {
    git.symrefs[`${REMOTES}origin/HEAD`] = `${REMOTES}origin/${srcHead}`
    git.refs[branchRef(srcHead)] = headOid
    const result = switchTrees(git, ws, {}, commitTree(git, headOid))
    if (!result.ok) throw new Error('空のディレクトリへのチェックアウトに失敗しました')
  } else if (!quiet) {
    cmd.err.push('warning: You appear to have cloned an empty repository.')
  }
  if (!quiet) cmd.err.push('done.')
  cmd.events.push({
    type: 'CLONED',
    url: srcPath,
    path: destPath,
    branch: headOid ? srcHead : null,
    empty: branches.length === 0,
  })
}
