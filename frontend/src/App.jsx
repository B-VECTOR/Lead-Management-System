import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/components/layout/RequireAuth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import LeadsList from '@/pages/LeadsList'
import LeadsKanban from '@/pages/LeadsKanban'
import LeadDetail from '@/pages/LeadDetail'
import LeadForm from '@/pages/LeadForm'
import ProjectDetail from '@/pages/ProjectDetail'
import Companies from '@/pages/Companies'
import CompanyDetail from '@/pages/CompanyDetail'
import Followups from '@/pages/Followups'
import Notifications from '@/pages/Notifications'
import Reports from '@/pages/Reports'
import Settings from '@/pages/Settings'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/leads" element={<LeadsList />} />
        <Route path="/leads/kanban" element={<LeadsKanban />} />
        <Route path="/leads/new" element={<LeadForm />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/leads/:id/edit" element={<LeadForm />} />

        <Route path="/projects/:id" element={<ProjectDetail />} />

        <Route path="/companies" element={<Companies />} />
        <Route path="/companies/:id" element={<CompanyDetail />} />

        <Route path="/followups" element={<Followups />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/reports" element={<Reports />} />

        <Route
          path="/settings"
          element={
            <RequireAuth roles={['Admin']}>
              <Settings />
            </RequireAuth>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
