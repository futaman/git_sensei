// ステージごとのいちばん良いランク（メニューに出す）。この端末のブラウザにだけ残す。
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Rank } from '../../drama/index.ts'
import { safeStorage } from '../storage.ts'

const ORDER: Rank[] = ['S', 'A', 'B', 'C', 'D']

interface RecordsState {
  best: Record<string, Rank>
  record: (stageId: string, rank: Rank) => void
}

export const useRecords = create<RecordsState>()(
  persist(
    (set, get) => ({
      best: {},
      record(stageId, rank) {
        const prev = Object.hasOwn(get().best, stageId) ? get().best[stageId] : undefined
        if (prev && ORDER.indexOf(prev) <= ORDER.indexOf(rank)) return
        set({ best: { ...get().best, [stageId]: rank } })
      },
    }),
    {
      name: 'git-sensei:records',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      // 壊れた保存データは捨てる
      merge: (saved, current) => {
        const best = (saved as { best?: unknown } | undefined)?.best
        if (!best || typeof best !== 'object') return current
        const clean: Record<string, Rank> = {}
        for (const [k, v] of Object.entries(best)) {
          if (typeof v === 'string' && (ORDER as string[]).includes(v)) clean[k] = v as Rank
        }
        return { ...current, best: clean }
      },
    },
  ),
)
