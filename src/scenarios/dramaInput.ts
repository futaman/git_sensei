// エンジンでコマンドを実行した結果を、演出エンジンへの入力にする（scenarios 層のつなぎ）。
import type { DramaInput } from '../drama/index.ts'
import { type ExecuteResult, stateHash } from '../engine/index.ts'
import { type DangerPolicy, detectDangers } from './dangers.ts'

export function commandInput(args: {
  command: string
  /** コマンドを実行したワークスペース */
  workspace: string
  result: ExecuteResult
  /** シナリオ開始からの経過ミリ秒 */
  at: number
  /** このコマンドで新たに満たしたマイルストーン（シナリオが判定する） */
  milestones?: string[]
  policy: DangerPolicy
}): DramaInput {
  const { command, workspace, result, at, policy } = args
  return {
    type: 'command',
    at,
    command,
    exitCode: result.exitCode,
    unsupported: result.unsupported ?? false,
    events: result.events,
    stateHash: stateHash(result.world),
    milestones: args.milestones ?? [],
    dangers: detectDangers(result.world, workspace, result.events, command, policy),
  }
}
