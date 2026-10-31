// フリーモードの画面（docs/03 §2.2 の PC レイアウト。右側はチャットの代わりに「できごと」）
import { useMemo, useState } from 'react'
import { fileStates, own, remoteSummaries, repoView } from '../../engine/index.ts'
import { FourAreas } from '../components/areas/FourAreas.tsx'
import { EditorPane } from '../components/editor/EditorPane.tsx'
import { EventLog } from '../components/events/EventLog.tsx'
import { FilePanel } from '../components/files/FilePanel.tsx'
import { CommitGraph } from '../components/graph/CommitGraph.tsx'
import { MobileShell } from '../components/layout/MobileShell.tsx'
import { Terminal } from '../components/terminal/Terminal.tsx'
import { MOBILE_QUERY, useMediaQuery } from '../hooks/useMediaQuery.ts'
import {
  HOME,
  type Preset,
  TEAM_BEAT_COUNT,
  teamBeatTitle,
  useFreeMode,
} from '../store/freeMode.ts'
import { type PlayApi, PlayProvider } from './PlayContext.tsx'

const PRESETS: Record<Preset, string> = {
  solo: 'ひとりで練習',
  team: 'チームで練習',
}

export function FreeModeScreen({ onExit }: { onExit: () => void }) {
  const world = useFreeMode((s) => s.world)
  const cwd = useFreeMode((s) => s.cwd)
  const preset = useFreeMode((s) => s.preset)
  const beat = useFreeMode((s) => s.beat)
  const lines = useFreeMode((s) => s.lines)
  const history = useFreeMode((s) => s.history)
  const selectedFile = useFreeMode((s) => s.selectedFile)
  const run = useFreeMode((s) => s.run)
  const editFile = useFreeMode((s) => s.editFile)
  const createFile = useFreeMode((s) => s.createFile)
  const removeFile = useFreeMode((s) => s.removeFile)
  const selectFile = useFreeMode((s) => s.selectFile)
  const reset = useFreeMode((s) => s.reset)
  const runNextBeat = useFreeMode((s) => s.runNextBeat)
  const mobile = useMediaQuery(MOBILE_QUERY)
  const [tab, setTab] = useState('terminal')

  const ws = own(world.workspaces, cwd)
  const files = useMemo(() => (ws ? fileStates(ws) : []), [ws])
  const view = useMemo(() => (ws?.git && !ws.git.bare ? repoView(ws.git) : null), [ws])
  const remotes = useMemo(() => (ws ? remoteSummaries(world, ws) : []), [world, ws])
  const nextBeat = teamBeatTitle(beat)
  const play: PlayApi = {
    world,
    cwd,
    home: HOME,
    lines,
    history,
    selectedFile,
    run,
    editFile,
    createFile,
    removeFile,
    selectFile,
  }

  const header = (
    <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 sm:gap-3 sm:px-4">
      <h1 className="font-mono text-base font-bold">git_sensei</h1>
      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">フリーモード</span>
      <label className="flex items-center gap-1 text-xs text-slate-600">
        <span className="sr-only">練習の舞台</span>
        <select
          value={preset}
          onChange={(e) => {
            const next = e.target.value as Preset
            if (
              window.confirm(
                `「${PRESETS[next]}」に切り替えます。いまの状態は消えます。よろしいですか？`,
              )
            ) {
              reset(next)
            }
          }}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
        >
          {Object.entries(PRESETS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {preset === 'team' && (
        <button
          type="button"
          onClick={runNextBeat}
          disabled={nextBeat === null}
          title={nextBeat ?? '台本はここまでです'}
          className="max-w-[28rem] truncate rounded bg-violet-600 px-3 py-1 text-xs text-white hover:bg-violet-700 disabled:bg-slate-300"
        >
          {nextBeat
            ? `同僚が作業する（${beat + 1}/${TEAM_BEAT_COUNT}）：${nextBeat}`
            : '同僚の作業はここまで'}
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              '最初の状態に戻します。いまのリポジトリとファイルは消えます。よろしいですか？',
            )
          )
            reset()
        }}
        className="ml-auto shrink-0 rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        最初からやり直す
      </button>
      <button
        type="button"
        onClick={onExit}
        className="shrink-0 rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        メニューへ
      </button>
    </header>
  )

  if (mobile) {
    return (
      <PlayProvider value={play}>
        <MobileShell
          header={header}
          active={tab}
          onSelect={setTab}
          tabs={[
            {
              key: 'events',
              label: 'できごと',
              content: (
                <div className="min-h-0 bg-slate-50">
                  <EventLog />
                </div>
              ),
            },
            {
              key: 'floor',
              label: 'フロア',
              content: (
                <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
                  <section className="min-h-0 bg-white">
                    <h2 className="sr-only">コミットグラフ</h2>
                    <CommitGraph view={view} />
                  </section>
                  <section className="min-h-0 overflow-x-auto border-t border-slate-200 bg-slate-50">
                    <h2 className="sr-only">4つの領域</h2>
                    <div className="h-full min-w-[720px]">
                      <FourAreas hasRepo={!!ws?.git} files={files} view={view} remotes={remotes} />
                    </div>
                  </section>
                </div>
              ),
            },
            {
              key: 'files',
              label: 'ファイル',
              content: (
                <div className="grid min-h-0 grid-rows-[minmax(0,40%)_minmax(0,1fr)] bg-white">
                  <FilePanel files={files} folder={ws?.path ?? cwd} />
                  <EditorPane />
                </div>
              ),
            },
            { key: 'terminal', label: 'ターミナル', content: <Terminal /> },
          ]}
        />
      </PlayProvider>
    )
  }

  return (
    <PlayProvider value={play}>
      <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_minmax(200px,34vh)] bg-slate-100 text-slate-900">
        {header}

        <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_280px]">
          <aside className="grid min-h-0 grid-rows-[minmax(0,40%)_minmax(0,1fr)] border-r border-slate-200 bg-white">
            <FilePanel files={files} folder={ws?.path ?? cwd} />
            <EditorPane />
          </aside>

          <main className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_minmax(150px,42%)]">
            <section className="min-h-0 bg-white">
              <h2 className="sr-only">コミットグラフ</h2>
              <CommitGraph view={view} />
            </section>
            <section className="min-h-0 overflow-x-auto border-t border-slate-200 bg-slate-50">
              <h2 className="sr-only">4つの領域</h2>
              <FourAreas hasRepo={!!ws?.git} files={files} view={view} remotes={remotes} />
            </section>
          </main>

          <aside className="min-h-0 border-l border-slate-200 bg-slate-50">
            <EventLog />
          </aside>
        </div>

        <Terminal />
      </div>
    </PlayProvider>
  )
}
