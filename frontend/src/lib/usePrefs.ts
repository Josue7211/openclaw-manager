

import { useEffect, useState } from 'react'

import { api } from '@/lib/api'

type PrefsMap = Record<string, string>

export function usePrefs(): PrefsMap {
  const [prefs, setPrefs] = useState<PrefsMap>({})

  useEffect(() => {
    api.get<{ prefs?: Array<{ key: string; value: string }> }>('/api/prefs')
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
