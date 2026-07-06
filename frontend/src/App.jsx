import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/components/layout/RequireAuth'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import LeadsLayout from '@/pages/LeadsLayout'
import LeadsList from '@/pages/LeadsList'
import TasksList from '@/pages/TasksList'
import AdditionalTasksList from '@/pages/AdditionalTasksList'
import LeadDetail from '@/pages/LeadDetail'
import LeadForm from '@/pages/LeadForm'
import Notifications from '@/pages/Notifications'
import Resources from '@/pages/Resources'
import Finance from '@/pages/Finance'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />

        <Route path="/leads" element={<LeadsLayout />}>
          <Route index element={<LeadsList />} />
          <Route path="tasks" element={<TasksList />} />
          <Route path="additional-tasks" element={<AdditionalTasksList />} />
        </Route>
        <Route path="/leads/new" element={<LeadForm />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/leads/:id/edit" element={<LeadForm />} />

        <Route path="/resources" element={<Resources />} />
        <Route path="/finance" element={<Finance />} />
        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
