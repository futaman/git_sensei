import { useState } from 'react'
import { FRIDAY_PUSH } from '../../scenarios/friday-push/scenario.ts'
import { FreeModeScreen } from '../play/FreeModeScreen.tsx'
import { MenuScreen } from '../play/MenuScreen.tsx'
import { StageScreen } from '../stage/StageScreen.tsx'
import { useStage } from '../store/stage.ts'
import { ErrorBoundary } from './ErrorBoundary.tsx'

const STAGES = [FRIDAY_PUSH]

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
          stages={STAGES}
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
