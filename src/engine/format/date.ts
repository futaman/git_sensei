import { formatTz } from '../objects/serialize.ts'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** git の既定の日付表示（"Wed Apr 1 09:00:00 2026 +0900"） */
export function formatGitDate(timestamp: number, tzOffset: number): string {
  const d = new Date((timestamp + tzOffset * 60) * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const time = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} ${time} ${d.getUTCFullYear()} ${formatTz(tzOffset)}`
}
