import { useEffect, useState } from 'react'

/** CSS のメディアクエリに今マッチしているか。画面の幅や、タッチ操作かどうかで出し分けるときに使う */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])
  return matches
}

/** スマホの幅（docs/08 の 9.2：768px 未満） */
export const MOBILE_QUERY = '(max-width: 767px)'
