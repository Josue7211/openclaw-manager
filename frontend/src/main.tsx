import './globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import LayoutShell from './components/LayoutShell'

import Dashboard from './pages/Dashboard'
import Personal from './pages/Personal'
import Chat from './pages/Chat'
import Todos from './pages/Todos'
import Calendar from './pages/Calendar'
import Reminders from './pages/Reminders'
import Messages from './pages/Messages'
import Pomodoro from './pages/Pomodoro'
import Email from './pages/Email'
import HomeLab from './pages/HomeLab'
import MediaRadar from './pages/MediaRadar'
import Missions from './pages/Missions'
import Agents from './pages/Agents'
import Memory from './pages/Memory'
import CronJobs from './pages/CronJobs'
import Pipeline from './pages/Pipeline'
import KnowledgeBase from './pages/KnowledgeBase'
import Ideas from './pages/Ideas'
import Capture from './pages/Capture'
import Settings from './pages/Settings'
import Search from './pages/Search'
import Login from './pages/Login'
import NotFound from './pages/NotFound'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 2,
    }
  }
})

// Tie React Query focus refetching to Tauri window focus events
if ((window as any).__TAURI_INTERNALS__) {
  import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
    focusManager.setEventListener((handleFocus) => {
      let unlisten: (() => void) | undefined
      getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        handleFocus(focused)
      }).then(fn => { unlisten = fn })
      return () => unlisten?.()
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<LayoutShell />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/personal" element={<Personal />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/pomodoro" element={<Pomodoro />} />
            <Route path="/email" element={<Email />} />
            <Route path="/homelab" element={<HomeLab />} />
            <Route path="/media" element={<MediaRadar />} />
            <Route path="/missions" element={<Missions />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/crons" element={<CronJobs />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/search" element={<Search />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
