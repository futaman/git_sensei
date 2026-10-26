// ストーリーのステージ画面。フリーモードと同じ部品（ターミナル、ファイル、エディタ、グラフ）に、
// 上の帯（しごと・時計・ゲージ）と右のチャット、演出の重ね物を足す。
import { useEffect, useMemo } from 'react'
import { fileStates, own, remoteSummaries, repoView } from '../../engine/index.ts'
import { FourAreas } from '../components/areas/FourAreas.tsx'
import { EditorPane } from '../components/editor/EditorPane.tsx'
import { FilePanel } from '../components/files/FilePanel.tsx'
import { CommitGraph } from '../components/graph/CommitGraph.tsx'
import { Terminal } from '../components/terminal/Terminal.tsx'
import { type PlayApi, PlayProvider } from '../play/PlayContext.tsx'
import { useStage } from '../store/stage.ts'
import { ChatPanel } from './ChatPanel.tsx'
import { GoalPanel } from './GoalPanel.tsx'
import {
  CutInOverlay,
  IntroModal,
  PushEffect,
  ReportModal,
  ResultPanel,
  ThunderModal,
} from './Overlays.tsx'
import { StageHeader } from './StageHeader.tsx'

export function StageScreen({ onExit }: { onExit: () => void }) {
  const def = useStage((s) => s.def)
  const session = useStage((s) => s.session)
  const phase = useStage((s) => s.phase)
  const lines = useStage((s) => s.lines)
  const history = useStage((s) => s.history)
  const selectedFile = useStage((s) => s.selectedFile)
  const shake = useStage((s) => s.shake)
  const tick = useStage((s) => s.tick)
  const run = useStage((s) => s.run)
  const editFile = useStage((s) => s.editFile)
  const createFile = useStage((s) => s.createFile)
  const removeFile = useStage((s) => s.removeFile)
  const selectFile = useStage((s) => s.selectFile)
  const load = useStage((s) => s.load)

  // 時間で進むもの（時計、手が止まったときの反応、締切）のために、1秒ごとに知らせる
  useEffect(() => {
    if (phase !== 'playing') return
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [phase, tick])

  const world = session?.world
  const cwd = session?.cwd ?? ''
  const ws = world ? own(world.workspaces, cwd) : undefined
  const files = useMemo(() => (ws ? fileStates(ws) : []), [ws])
  const view = useMemo(() => (ws?.git && !ws.git.bare ? repoView(ws.git) : null), [ws])
  const remotes = useMemo(() => (world && ws ? remoteSummaries(world, ws) : []), [world, ws])
  const chips = useMemo(
    () => (def && session ? def.chips(session.world, session.progress) : []),
    [def, session],
  )

  if (!def) return null
  const retry = () => load(def)

  if (!session || !world) {
    return (
      <div className="h-screen bg-slate-100">
        <IntroModal />
      </div>
    )
  }

  const play: PlayApi = {
    world,
    cwd,
    home: def.home,
    lines,
    history,
    selectedFile,
    run,
    editFile,
    createFile,
    removeFile,
    selectFile,
    chips,
    locked: phase !== 'playing',
  }

  return (
    <PlayProvider value={play}>
      <div
        key={shake?.id}
        className={`grid h-screen grid-rows-[auto_minmax(0,1fr)_minmax(200px,32vh)] bg-slate-100 text-slate-900 ${shake ? `stage-shake-${shake.intensity}` : ''}`}
      >
        <StageHeader onExit={onExit} />
        <div className="grid min-h-0 grid-cols-[260px_minmax(0,1fr)_300px]">
          <aside className="grid min-h-0 grid-rows-[minmax(0,34%)_minmax(0,1fr)] border-r border-slate-200 bg-white">
            <FilePanel files={files} folder={ws?.path ?? cwd} />
            <EditorPane />
          </aside>
          <main className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(150px,42%)]">
            <section className="relative min-h-0 overflow-hidden bg-white">
              <h2 className="sr-only">コミットグラフ</h2>
              <CommitGraph view={view} />
              <PushEffect />
            </section>
            <section className="min-h-0 border-t border-slate-200 bg-slate-50">
              <h2 className="sr-only">4つの領域</h2>
              <FourAreas hasRepo={!!ws?.git} files={files} view={view} remotes={remotes} />
            </section>
          </main>
          <aside className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-l border-slate-200 bg-white">
            <GoalPanel />
            <ChatPanel />
          </aside>
        </div>
        <Terminal />
      </div>
      <CutInOverlay />
      <ReportModal />
      <ThunderModal key={`thunder-${session.drama.thunder}`} onRetry={retry} />
      <ResultPanel onRetry={retry} onExit={onExit} />
    </PlayProvider>
  )
}
