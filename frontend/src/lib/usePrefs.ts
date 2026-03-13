

import { useEffect, useState } from 'react'

const API_BASE = 'http://127.0.0.1:3000'

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
