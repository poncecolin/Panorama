import { useCallback, useEffect, useRef, useState } from 'react'
import { AppSettings, SettingsPatch } from '@shared/types'
import { makeDefaultSettings, mergeSettings } from '@shared/settings'

/** True when running inside Electron with the preload bridge available. */
export const hasBridge = typeof window !== 'undefined' && !!window.panorama

/**
 * Loads AppSettings from the main process and provides a patch updater that
 * persists back. Falls back to in-memory defaults when the bridge is absent
 * (e.g. opened in a plain browser preview), so the UI still renders.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const localRef = useRef<AppSettings>(makeDefaultSettings())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      if (hasBridge) {
        const s = await window.panorama.getSettings()
        if (!cancelled) setSettings(s)
      } else {
        if (!cancelled) setSettings(localRef.current)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const update = useCallback(async (patch: SettingsPatch) => {
    if (hasBridge) {
      const merged = await window.panorama.setSettings(patch)
      setSettings(merged)
      return merged
    }
    const merged = mergeSettings(localRef.current, patch)
    localRef.current = merged
    setSettings(merged)
    return merged
  }, [])

  const reset = useCallback(async () => {
    if (hasBridge) {
      const fresh = await window.panorama.resetSettings()
      setSettings(fresh)
      return fresh
    }
    const fresh = makeDefaultSettings()
    localRef.current = fresh
    setSettings(fresh)
    return fresh
  }, [])

  return { settings, update, reset }
}
