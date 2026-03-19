import { useEffect, useState, useRef } from 'react'
import { useLocation } from 'react-router-dom'

export function NavigationProgressBar() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const [progress, setProgress] = useState(0)
  const isFirstRender = useRef(true)

  useEffect(() => {
    // Skip first render (initial page load)
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }

    setVisible(true)
    setProgress(30)
    const t1 = setTimeout(() => setProgress(60), 150)
    const t2 = setTimeout(() => setProgress(90), 350)
    const t3 = setTimeout(() => {
      setProgress(100)
      setTimeout(() => {
        setVisible(false)
        setProgress(0)
      }, 200)
    }, 500)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [location.pathname])

  if (!visible) return null

  return (
    <div
      role="progressbar"
      aria-valuenow={progress}
      aria-label="Loading page"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        zIndex: 'var(--z-max)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'var(--accent)',
          transition:
            progress < 100
              ? 'width 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'width 0.15s ease, opacity 0.3s ease',
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  )
}
