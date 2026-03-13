

import { useEffect, useState } from 'react'

type PrefsMap = Record<string, string>

export function usePrefs(): PrefsMap {
  const [prefs, setPrefs] = useState<PrefsMap>({})

  useEffect(() => {
    fetch('/api/prefs')
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
