import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/index.css'
import { App } from './ui/app/App.tsx'

const root = document.getElementById('root')
if (!root) throw new Error('#root が見つかりません')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
