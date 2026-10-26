// 操作の分類（docs/04 §2.1）。上から順に判定し、最初に当てはまったものを採る。
import { tokenizeLoosely } from './tokens.ts'
import type { Category, DangerSignal, DramaState } from './types.ts'

/** git の状態を見るだけのコマンドか（status / log / diff / branch の一覧 など） */
export function isObservation(command: string): boolean {
  const [program, sub, ...rest] = tokenizeLoosely(command)
  if (program === undefined) return true
  if (program !== 'git') return ['ls', 'pwd', 'cat'].includes(program)
  const args = rest.filter((a) => !a.startsWith('-'))
  switch (sub) {
    case 'status':
    case 'log':
    case 'diff':
    case 'show':
    case 'reflog':
      return true
    case 'branch':
      // 名前を渡さず、一覧系のオプションだけなら一覧の表示
      return (
        args.length === 0 &&
        !rest.some((a) =>
          /^-(d|D|m|M|u|f)$|^--(delete|move|set-upstream-to|unset-upstream|force)/.test(a),
        )
      )
    case 'remote':
      return (
        rest.length === 0 ||
        rest.every((a) => a === '-v' || a === '--verbose') ||
        rest[0] === 'get-url'
      )
    case 'config':
      // 値を渡さなければ読むだけ
      return args.length <= 1 && !rest.some((a) => a === '--unset')
    default:
      return false
  }
}

export interface ClassifyInput {
  command: string
  exitCode: number
  unsupported: boolean
  stateHash: string
  milestones: string[]
  dangers: DangerSignal[]
}

export function classify(state: DramaState, input: ClassifyInput): Category {
  if (input.dangers.some((d) => !d.allowed)) return 'danger'
  if (input.unsupported) return 'unsupported'
  if (input.exitCode !== 0) return 'error'
  if (isObservation(input.command)) return 'observe'
  if (input.milestones.length > 0) return 'progress'
  if (input.stateHash === state.lastHash) return 'noop'
  if (state.visited[input.stateHash]) {
    // 直前のミス（エラーや危険）をすぐ打ち消したのなら、後退ではない
    return state.lastCategory === 'danger' || state.lastCategory === 'error'
      ? 'quickfix'
      : 'regress'
  }
  return 'normal'
}
