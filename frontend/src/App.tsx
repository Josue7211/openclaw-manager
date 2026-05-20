import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import AuthGuard from '@/components/AuthGuard'
import LayoutShell from '@/components/LayoutShell'

const Dashboard = lazy(() => import('@/pages/Dashboard'))
const Personal = lazy(() => import('@/pages/Personal'))
const Chat = lazy(() => import('@/pages/Chat'))
const Builder = lazy(() => import('@/pages/Builder'))
const Todos = lazy(() => import('@/pages/Todos'))
const Calendar = lazy(() => import('@/pages/Calendar'))
const Reminders = lazy(() => import('@/pages/Reminders'))
const Messages = lazy(() => import('@/pages/Messages'))
const Pomodoro = lazy(() => import('@/pages/Pomodoro'))
const Email = lazy(() => import('@/pages/Email'))
const JobHunter = lazy(() => import('@/pages/JobHunter'))
const GrowthOps = lazy(() => import('@/pages/GrowthOps'))
const Training = lazy(() => import('@/pages/Training'))
const HomeLabOverview = lazy(() => import('@/pages/homelab/HomeLabOverview'))
const HomeLabProxmox = lazy(() => import('@/pages/homelab/ProxmoxModule'))
const HomeLabPortainer = lazy(() => import('@/pages/homelab/PortainerModule'))
const HomeLabNetwork = lazy(() => import('@/pages/homelab/NetworkModule'))
const HomeLabStorage = lazy(() => import('@/pages/homelab/StorageBackupsModule'))
const HomeLabPower = lazy(() => import('@/pages/homelab/PowerHardwareModule'))
const HomeLabServices = lazy(() => import('@/pages/homelab/ServicesModule'))
const HomeLabActivity = lazy(() => import('@/pages/homelab/ActivitySettingsModule'))
const MediaRadar = lazy(() => import('@/pages/MediaRadar'))
const Missions = lazy(() => import('@/pages/Missions'))
const Harness = lazy(() => import('@/pages/Harness'))
const Memory = lazy(() => import('@/pages/Memory'))
const Pipeline = lazy(() => import('@/pages/Pipeline'))
const KnowledgeBase = lazy(() => import('@/pages/KnowledgeBase'))
const Notes = lazy(() => import('@/pages/notes/Notes'))
const RemoteViewer = lazy(() => import('@/pages/remote/RemotePage'))
const Approvals = lazy(() => import('@/pages/approvals/ApprovalsPage'))
const Activity = lazy(() => import('@/pages/activity/ActivityPage'))
const Ideas = lazy(() => import('@/pages/Ideas'))
const Capture = lazy(() => import('@/pages/Capture'))
const Settings = lazy(() => import('@/pages/Settings'))
const Search = lazy(() => import('@/pages/Search'))
const Login = lazy(() => import('@/pages/Login'))
const TrainingPublicIntake = lazy(() => import('@/pages/TrainingPublicIntake'))
const CustomPage = lazy(() => import('@/pages/CustomPage'))
const NotFound = lazy(() => import('@/pages/NotFound'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function PageLoader() {
  return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading...</div>
}

function GuardedLayout() {
  return (
    <AuthGuard>
      <LayoutShell />
    </AuthGuard>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/form/:token" element={<TrainingPublicIntake />} />
        <Route path="/training/intake/:token" element={<TrainingPublicIntake />} />
        <Route element={<GuardedLayout />}>
          <Route element={<Outlet />}>
            <Route path="/" element={<Personal />} />
            <Route path="/personal" element={<Navigate to="/" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/builder" element={<Builder />} />
            <Route path="/todos" element={<Todos />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/pomodoro" element={<Pomodoro />} />
            <Route path="/email" element={<Email />} />
            <Route path="/jobs" element={<JobHunter />} />
            <Route path="/growth-ops" element={<GrowthOps />} />
            <Route path="/training/*" element={<Training />} />
            <Route path="/homelab" element={<HomeLabOverview />} />
            <Route path="/homelab/proxmox" element={<HomeLabProxmox />} />
            <Route path="/homelab/portainer" element={<HomeLabPortainer />} />
            <Route path="/homelab/network" element={<HomeLabNetwork />} />
            <Route path="/homelab/storage" element={<HomeLabStorage />} />
            <Route path="/homelab/power" element={<HomeLabPower />} />
            <Route path="/homelab/services" element={<HomeLabServices />} />
            <Route path="/homelab/activity" element={<HomeLabActivity />} />
            <Route path="/media" element={<MediaRadar />} />
            <Route path="/missions" element={<Missions />} />
            <Route path="/harness" element={<Harness />} />
            <Route path="/openclaw" element={<Navigate to="/harness" replace />} />
            <Route path="/agents" element={<Navigate to="/harness" replace />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/crons" element={<Navigate to="/harness" replace />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/knowledge" element={<KnowledgeBase />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/sessions" element={<Navigate to="/chat" replace />} />
            <Route path="/remote" element={<RemoteViewer />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/activity" element={<Activity />} />
            <Route path="/ideas" element={<Ideas />} />
            <Route path="/capture" element={<Capture />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/search" element={<Search />} />
            <Route path="/custom/:id" element={<CustomPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
