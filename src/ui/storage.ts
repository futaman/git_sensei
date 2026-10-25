// localStorage は使えないことがある（プライベートウィンドウなど）。失敗しても画面は動くようにする。
import type { StateStorage } from 'zustand/middleware'

export const safeStorage: StateStorage = {
  getItem(name) {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem(name, value) {
    try {
      localStorage.setItem(name, value)
    } catch {
      // 保存できなくても続ける
    }
  },
  removeItem(name) {
    try {
      localStorage.removeItem(name)
    } catch {
      // 同上
    }
  },
}
