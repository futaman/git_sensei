// フリーモードとステージで共通の部品（ターミナル、ファイル一覧、エディタ）が使う、遊んでいる場の情報。
// どちらの画面も、自分のストアからこの形を作って渡す。
import { createContext, type ReactNode, useContext } from 'react'
import type { World } from '../../engine/index.ts'
import type { Chip } from '../components/terminal/chips.ts'
import type { TerminalLine } from '../store/freeMode.ts'

export interface PlayApi {
  world: World
  cwd: string
  /** cd ~ の行き先（プロンプトの ~ 表示にも使う） */
  home: string
  lines: TerminalLine[]
  history: string[]
  selectedFile: string | null
  run: (input: string) => void
  editFile: (path: string, content: string) => void
  /** 作れなかったときは理由を返す */
  createFile: (path: string) => string | null
  removeFile: (path: string) => void
  selectFile: (path: string | null) => void
  /** シナリオが決めた補助チップ。なければ状態から自動で出す */
  chips?: Chip[]
  /** 入力を受け付けない（クリア後など） */
  locked?: boolean
}

const PlayContext = createContext<PlayApi | null>(null)

export function PlayProvider({ value, children }: { value: PlayApi; children: ReactNode }) {
  return <PlayContext.Provider value={value}>{children}</PlayContext.Provider>
}

export function usePlay(): PlayApi {
  const api = useContext(PlayContext)
  if (!api) throw new Error('PlayProvider の外で使われています')
  return api
}
