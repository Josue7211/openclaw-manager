

import { useEffect, useState } from 'react'

import { API_BASE } from '@/lib/api'

type PrefsMap = Record<string, string>

export function usePrefs(): PrefsMap {
  const [prefs, setPrefs] = useState<PrefsMap>({})

  useEffect(() => {
    fetch(`${API_BASE}/api/prefs`)
      .then(r => r.json())
      .then(data => {
        const map: PrefsMap = {}
        for (const pref of data.prefs ?? []) {
          map[pref.key] = pref.value
        }
        setPrefs(map)
      })
      .catch(() => {})
  }, [])

  return prefs
}
