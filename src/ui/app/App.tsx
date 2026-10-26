import { useState } from 'react'
import { CHAPTERS } from '../../scenarios/catalog.ts'
import { FreeModeScreen } from '../play/FreeModeScreen.tsx'
import { MenuScreen } from '../play/MenuScreen.tsx'
import { StageScreen } from '../stage/StageScreen.tsx'
import { useStage } from '../store/stage.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'

type Screen = 'menu' | 'free' | 'stage'

export function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const load = useStage((s) => s.load)
  const exitStage = useStage((s) => s.exit)
  const toMenu = () => {
    exitStage()
    setScreen('menu')
  }

  return (
    <ErrorBoundary>
      {screen === 'menu' && (
        <MenuScreen
          chapters={CHAPTERS}
          onStage={(def) => {
            load(def)
            setScreen('stage')
          }}
          onFree={() => setScreen('free')}
        />
      )}
      {screen === 'free' && <FreeModeScreen onExit={toMenu} />}
      {screen === 'stage' && <StageScreen onExit={toMenu} />}
    </ErrorBoundary>
  )
}
