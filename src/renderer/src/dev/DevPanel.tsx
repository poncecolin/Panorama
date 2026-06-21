import { useEffect, useRef, useState } from 'react'
import { AppSettings, SettingsPatch, TrackingState, TuningParams } from '@shared/types'
import { DEFAULT_TUNING } from '@shared/types'
import { EngineStatus } from '../engine/PanoramaEngine'
import { CameraPanel } from './panels/CameraPanel'
import { PosePanel } from './panels/PosePanel'
import { PerfPanel } from './panels/PerfPanel'
import { TuningPanel } from './panels/TuningPanel'

interface Props {
  status: EngineStatus | null
  settings: AppSettings
  onUpdate: (patch: SettingsPatch) => void
  getVideo: () => HTMLVideoElement | null
}

type Tab = 'camera' | 'pose' | 'perf' | 'tuning'
const TABS: { id: Tab; label: string }[] = [
  { id: 'camera', label: 'Camera' },
  { id: 'pose', label: 'Pose' },
  { id: 'perf', label: 'Perf' },
  { id: 'tuning', label: 'Tuning' }
]

const STATE_LABEL: Record<TrackingState, string> = {
  [TrackingState.Acquiring]: 'Acquiring',
  [TrackingState.Tracking]: 'Tracking',
  [TrackingState.Holding]: 'Holding',
  [TrackingState.GlideToAttract]: 'Glide → Attract',
  [TrackingState.Attract]: 'Attract',
  [TrackingState.GlideToTrack]: 'Glide → Tracking'
}

/** Developer mode: four tabbed views over the live pipeline. */
export function DevPanel({ status, settings, onUpdate, getVideo }: Props) {
  const [tab, setTab] = useState<Tab>('camera')

  const setTuning = (patch: Partial<TuningParams>) =>
    onUpdate({ tuning: { ...settings.tuning, ...patch } })

  return (
    <div className="dev-panel">
      <div className="dev-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        <span className="dev-state">
          {status ? STATE_LABEL[status.state] : '—'}
        </span>
      </div>

      <div className="dev-body">
        {tab === 'camera' && <CameraPanel status={status} getVideo={getVideo} />}
        {tab === 'pose' && <PosePanel status={status} settings={settings} />}
        {tab === 'perf' && <PerfPanel status={status} />}
        {tab === 'tuning' && (
          <TuningPanel
            tuning={settings.tuning}
            onChange={setTuning}
            onReset={() => onUpdate({ tuning: { ...DEFAULT_TUNING } })}
          />
        )}
      </div>
    </div>
  )
}
