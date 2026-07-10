import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/components/layout/RequireAuth'
import Login from '@/pages/Login'
import ForgotPassword from '@/pages/ForgotPassword'
import ResetPassword from '@/pages/ResetPassword'
import Account from '@/pages/Account'
import Dashboard from '@/pages/Dashboard'
import LeadsList from '@/pages/LeadsList'
import OtherTasks from '@/pages/OtherTasks'
import LeadDetail from '@/pages/LeadDetail'
import LeadForm from '@/pages/LeadForm'
import Notifications from '@/pages/Notifications'
import HeldLeads from '@/pages/HeldLeads'
import HeldTasks from '@/pages/HeldTasks'
import Resources from '@/pages/Resources'
import ProjectClosure from '@/pages/ProjectClosure'
import Finance from '@/pages/Finance'
import UsersList from '@/pages/UsersList'
import UserForm from '@/pages/UserForm'
import NotFound from '@/pages/NotFound'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/account" element={<Account />} />

        <Route path="/leads" element={<LeadsList />} />
        <Route path="/leads/new" element={<LeadForm />} />
        <Route path="/leads/:id" element={<LeadDetail />} />
        <Route path="/leads/:id/edit" element={<LeadForm />} />

        <Route path="/other-tasks" element={<OtherTasks />} />

        <Route path="/held-leads" element={<HeldLeads />} />
        <Route path="/held-tasks" element={<HeldTasks />} />

        <Route path="/resources" element={<Resources />} />
        <Route path="/project-closure" element={<ProjectClosure />} />
        <Route path="/finance" element={<Finance />} />

        <Route path="/users" element={<UsersList />} />
        <Route path="/users/new" element={<UserForm />} />
        <Route path="/users/:id/edit" element={<UserForm />} />

        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
