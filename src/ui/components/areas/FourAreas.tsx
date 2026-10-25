// 4領域ビュー：作業ツリー → ステージ → ローカルリポジトリ → リモート（docs/03 §2.1）
import type { ReactNode } from 'react'
import type { FileState, RepoView } from '../../../engine/index.ts'

const WORKTREE_LABEL = { untracked: '未追跡', modified: '変更', deleted: '削除' } as const
const STAGED_LABEL = { A: '新規', M: '変更', D: '削除' } as const
const TONE = {
  untracked: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  modified: 'bg-amber-50 text-amber-800 border-amber-200',
  deleted: 'bg-rose-50 text-rose-800 border-rose-200',
  A: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  M: 'bg-amber-50 text-amber-800 border-amber-200',
  D: 'bg-rose-50 text-rose-800 border-rose-200',
} as const

function Pill({ path, label, tone }: { path: string; label: string; tone: keyof typeof TONE }) {
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded border px-2 py-0.5 text-xs ${TONE[tone]}`}
    >
      <span className="truncate font-mono">{path}</span>
      <span className="shrink-0">{label}</span>
    </li>
  )
}

function Area({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white p-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold text-slate-700">{title}</h3>
        <span className="truncate text-[10px] text-slate-400">{hint}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}

function Arrow({ command }: { command: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center px-1 text-slate-400">
      <span className="font-mono text-[10px]">{command}</span>
      <span aria-hidden="true">→</span>
    </div>
  )
}

const Muted = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-slate-400">{children}</p>
)

export function FourAreas({
  hasRepo,
  files,
  view,
}: {
  hasRepo: boolean
  files: FileState[]
  view: RepoView | null
}) {
  const changed = files.filter((f) => f.worktree !== 'clean')
  const clean = files.length - changed.length
  const staged = files.filter((f) => f.staged !== null)
  const headCommit = view?.commits.find((c) => c.oid === view.head)

  return (
    <div className="flex h-full gap-1 p-2">
      <Area title="作業ツリー" hint="手元のファイル">
        <ul className="space-y-1">
          {changed.map((f) => (
            <Pill
              key={f.path}
              path={f.path}
              label={WORKTREE_LABEL[f.worktree as keyof typeof WORKTREE_LABEL]}
              tone={f.worktree as keyof typeof WORKTREE_LABEL}
            />
          ))}
        </ul>
        {changed.length === 0 && <Muted>変更はありません</Muted>}
        {hasRepo && clean > 0 && <Muted>ほか {clean} 個は変更なし</Muted>}
      </Area>
      <Arrow command="add" />
      <Area title="ステージ" hint="次のコミットに入る変更">
        {!hasRepo && <Muted>git init で使えるようになります</Muted>}
        <ul className="space-y-1">
          {staged.map((f) => (
            <Pill
              key={f.path}
              path={f.path}
              label={STAGED_LABEL[f.staged as 'A']}
              tone={f.staged as 'A'}
            />
          ))}
        </ul>
        {hasRepo && staged.length === 0 && <Muted>空です</Muted>}
      </Area>
      <Arrow command="commit" />
      <Area title="ローカルリポジトリ" hint=".git の中">
        {!view && <Muted>まだありません</Muted>}
        {view && (
          <dl className="space-y-1 text-xs">
            <div className="flex gap-2">
              <dt className="text-slate-500">いる場所</dt>
              <dd className="font-mono font-bold text-emerald-700">
                {view.branch ?? `detached（${headCommit?.short ?? '?'}）`}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">最新</dt>
              <dd className="truncate">
                {headCommit ? (
                  <>
                    <span className="font-mono text-slate-500">{headCommit.short}</span>{' '}
                    {headCommit.subject}
                  </>
                ) : (
                  'コミットなし'
                )}
              </dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">コミット数</dt>
              <dd>{view.commits.length}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-500">ブランチ</dt>
              <dd className="truncate font-mono">
                {view.branches.map((b) => b.name).join(', ') || '—'}
              </dd>
            </div>
          </dl>
        )}
      </Area>
      <Arrow command="push" />
      <Area title="リモート" hint="GitHub など">
        <Muted>まだありません（M3 で clone / push / pull に対応）</Muted>
      </Area>
    </div>
  )
}
