import { useState, useEffect, memo } from 'react'

export default memo(function SecondsAgo({ sinceMs }: { sinceMs: number }) {
  const [s, setS] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setS(Math.floor((Date.now() - sinceMs) / 1000)), 1000)
    return () => clearInterval(t)
  }, [sinceMs])
  return <>{s}s ago</>
})
