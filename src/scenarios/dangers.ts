// 危険な操作の判定（docs/04 §4.2）。エンジンの意味イベントと world を見て、演出エンジンに渡す信号にする。
// drama 層は world を調べられない（engine の型だけに依存する）ので、ここで行う。
import type { DangerKind, DangerSignal, YabaLevel } from '../drama/index.ts'
import {
  commitFileContents,
  commitFiles,
  commitMessage,
  commitsBetween,
  type GitEvent,
  hasConflictMarkers,
  remoteRepository,
  type World,
} from '../engine/index.ts'

export interface DangerPolicy {
  /** プレイヤーの名前（自分のコミットか、他人のコミットかを見分ける） */
  player: string
  /** 直接 push してはいけないブランチ（既定は空。シナリオが決める） */
  protectedBranches?: string[]
  /** 秘密情報のファイル。'/' で終われば ディレクトリ、* を含めばファイル名のパターン */
  secretPatterns?: string[]
  /** add してはいけないファイル */
  junkPatterns?: string[]
  /** 質の低いコミットメッセージ（1行目がまるごと一致したら） */
  badMessages?: RegExp
  /** シナリオが許可する危険（周知してから --force-with-lease した、など） */
  allow?: (kind: DangerKind, command: string) => boolean
}

export const DEFAULT_SECRETS = ['.env', '.env.*', '*.pem', '*.key', 'id_rsa', 'credentials.json']
export const DEFAULT_JUNK = ['node_modules/', 'dist/', '.DS_Store', '*.log']
export const DEFAULT_BAD_MESSAGES = /^(a+|あ+|test|tmp|wip|fix|update|修正|変更|とりあえず|\.+)$/i

/** パスがパターンに当てはまるか */
export function matchesPattern(path: string, pattern: string): boolean {
  const name = path.split('/').pop() ?? path
  if (pattern.endsWith('/')) return path.startsWith(pattern) || path.includes(`/${pattern}`)
  if (pattern.includes('*')) {
    const re = new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    return re.test(name)
  }
  return name === pattern || path === pattern
}

const anyMatch = (path: string, patterns: string[]) => patterns.some((p) => matchesPattern(path, p))

/**
 * 1つのコマンドの結果から、危険の信号を作る。
 * workspace は実行したワークスペース（world.workspaces のキー）。after はコマンドの後の world
 */
export function detectDangers(
  after: World,
  workspace: string,
  events: GitEvent[],
  command: string,
  policy: DangerPolicy,
): DangerSignal[] {
  // .git を消した後は git がないので、先に見る
  if (events.some((e) => e.type === 'REPO_DELETED')) {
    return [{ kind: 'REPO_DELETED', allowed: policy.allow?.('REPO_DELETED', command) ?? false }]
  }
  const git = Object.hasOwn(after.workspaces, workspace) ? after.workspaces[workspace]?.git : null
  if (!git) return []
  const secrets = policy.secretPatterns ?? DEFAULT_SECRETS
  const junk = policy.junkPatterns ?? DEFAULT_JUNK
  const bad = policy.badMessages ?? DEFAULT_BAD_MESSAGES
  const found = new Map<DangerKind, { detail?: string; level?: YabaLevel }>()
  const flag = (kind: DangerKind, detail?: string, level?: YabaLevel) => {
    if (!found.has(kind)) found.set(kind, { detail, level })
  }
  /** コミットの中で、コンフリクトの印が残っているファイル */
  /**
   * コミットで新しく印が入ったファイル。比べる相手（親や、push 前のリモートの先端）にもう印があったなら、
   * 前からあったものなので数えない（矢印の残ったページを直す途中のコミットなど）
   */
  const markedFile = (repo: typeof git, oid: string, base: string | null | undefined) => {
    const before = base ? commitFileContents(repo, base) : {}
    return Object.entries(commitFileContents(repo, oid)).find(
      ([path, text]) =>
        hasConflictMarkers(text) &&
        !(Object.hasOwn(before, path) && hasConflictMarkers(before[path] as string)),
    )?.[0]
  }

  for (const e of events) {
    switch (e.type) {
      case 'FORCE_PUSH_OVERWROTE': {
        const others = e.authors.filter((a) => a !== policy.player)
        if (others.length > 0) flag('FORCE_PUSH_OVERWROTE', others.join('、'))
        else flag('HISTORY_REWRITTEN_ON_SHARED_BRANCH', e.branch)
        break
      }
      case 'PUSHED': {
        // 送り先のリポジトリで調べる（push 前にあったコミットは、手元にないことがある）
        const target = remoteRepository(after, workspace, e.remote) ?? git
        for (const u of e.updates) {
          if (u.to === null) continue
          if (!u.forced && (policy.protectedBranches ?? []).includes(u.branch)) {
            flag('DIRECT_PUSH_TO_PROTECTED', u.branch)
          }
          // 新しく送ったコミットのどこかに、秘密情報のファイルが入っていないか
          for (const oid of commitsBetween(target, u.from, u.to)) {
            const leaked = commitFiles(target, oid).find((p) => anyMatch(p, secrets))
            if (leaked) {
              flag('SECRET_PUSHED', leaked)
              break
            }
          }
          // 印が残ったまま push した：みんなに広がるので Lv3（docs/04_spec_scenarios §4.4）
          const marked = markedFile(target, u.to, u.from)
          if (marked) flag('CONFLICT_MARKER_COMMITTED', marked, 3)
        }
        break
      }
      case 'COMMIT_CREATED': {
        const marked = markedFile(git, e.oid, e.parents[0])
        if (marked) flag('CONFLICT_MARKER_COMMITTED', marked)
        if (e.parents.length > 1) break
        const subject = commitMessage(git, e.oid).split('\n')[0]?.trim() ?? ''
        if (bad.test(subject)) flag('BAD_COMMIT_MESSAGE', subject)
        break
      }
      case 'FILES_STAGED': {
        const junkFile = e.paths.find((p) => anyMatch(p, junk))
        if (junkFile) flag('JUNK_STAGED', junkFile)
        break
      }
      case 'COMMITS_ORPHANED':
        flag('COMMITS_ORPHANED', e.oids.map((o) => o.slice(0, 7)).join('、'))
        break
      case 'CHANGES_DISCARDED':
        // ファイルを指定して戻すのは、わかってやっている取り消し。まとめて消したとき（reset --hard、'.'）だけ危険とみなす
        if (e.bulk) flag('UNCOMMITTED_CHANGES_DISCARDED', e.paths.join('、'))
        break
      default:
        break
    }
  }
  return [...found].map(([kind, { detail, level }]) => ({
    kind,
    allowed: policy.allow?.(kind, command) ?? false,
    ...(detail !== undefined ? { detail } : {}),
    ...(level !== undefined ? { level } : {}),
  }))
}
