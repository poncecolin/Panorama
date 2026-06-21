import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { TrackerSelfTest } from './dev/TrackerSelfTest'
import { RenderSelfTest } from './dev/RenderSelfTest'
import './styles.css'

const selftest = new URLSearchParams(location.search).get('selftest')

function Root() {
  if (selftest === 'tracker' || selftest === 'track-live') return <TrackerSelfTest />
  if (selftest === 'render') return <RenderSelfTest />
  return <App />
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
)
