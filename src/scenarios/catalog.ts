// ストーリーの章立て（docs/07 の 2章）。メニューはこの順に並べる。
import { ARROW_TOP } from './arrow-top/scenario.ts'
import { DEMO_DETACHED } from './demo-detached/scenario.ts'
import { DOJO } from './dojo/scenario.ts'
import { ENV_LEAK } from './env-leak/scenario.ts'
import { FIRST_DAY } from './first-day/scenario.ts'
import { FRIDAY_PUSH } from './friday-push/scenario.ts'
import { MONDAY_STANDUP } from './monday-standup/scenario.ts'
import { PROTECTED_MAIN } from './protected-main/scenario.ts'
import { RELEASE_26 } from './release-26/scenario.ts'
import { RESUME_STAGE } from './resume/scenario.ts'
import { SENPAI_FORCE } from './senpai-force/scenario.ts'
import type { StageDefinition } from './stage.ts'

export interface Chapter {
  title: string
  /** 章で覚えること */
  summary: string
  stages: StageDefinition[]
}

export const CHAPTERS: Chapter[] = [
  {
    title: '1章 新人編',
    summary: 'clone、log、add・commit・push、ブランチ、pull とコンフリクト。月曜から金曜まで',
    stages: [FIRST_DAY, MONDAY_STANDUP, PROTECTED_MAIN, FRIDAY_PUSH],
  },
  {
    title: '2章 独り立ち編',
    summary: 'detached HEAD、fetch と --force-with-lease、直すコミット、reset と rm --cached',
    stages: [DEMO_DETACHED, SENPAI_FORCE, ARROW_TOP, RELEASE_26, RESUME_STAGE],
  },
  {
    title: '3章 先輩編',
    summary: '後輩を見る側に。git より先にやること',
    stages: [ENV_LEAK],
  },
  {
    title: '外伝',
    summary: '本番でやったら終わることを、研修で全部やる',
    stages: [DOJO],
  },
]

export const ALL_STAGES: StageDefinition[] = CHAPTERS.flatMap((c) => c.stages)
