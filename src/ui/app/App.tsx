import { FreeModeScreen } from '../play/FreeModeScreen.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

export function App() {
  return (
    <ErrorBoundary>
      <FreeModeScreen />
    </ErrorBoundary>
  )
}
