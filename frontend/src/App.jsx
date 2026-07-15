import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { canSeeLeadModule, canSeeFollowUps, canSeeHeldQueues } from '@/api/scope'
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

        <Route path="/leads" element={<RequireAuth check={canSeeLeadModule}><LeadsList /></RequireAuth>} />
        <Route path="/leads/new" element={<RequireAuth check={canSeeLeadModule}><LeadForm /></RequireAuth>} />
        <Route path="/leads/:id" element={<RequireAuth check={canSeeLeadModule}><LeadDetail /></RequireAuth>} />
        <Route path="/leads/:id/edit" element={<RequireAuth check={canSeeLeadModule}><LeadForm /></RequireAuth>} />

        <Route path="/other-tasks" element={<RequireAuth check={canSeeFollowUps}><OtherTasks /></RequireAuth>} />

        <Route path="/held-leads" element={<RequireAuth check={canSeeHeldQueues}><HeldLeads /></RequireAuth>} />
        <Route path="/held-tasks" element={<RequireAuth check={canSeeHeldQueues}><HeldTasks /></RequireAuth>} />

        <Route path="/resources" element={<RequireAuth roles={['Resource Manager']}><Resources /></RequireAuth>} />
        <Route path="/project-closure" element={<RequireAuth roles={['Resource Manager']}><ProjectClosure /></RequireAuth>} />
        <Route path="/finance" element={<RequireAuth roles={['Finance']}><Finance /></RequireAuth>} />

        <Route path="/users" element={<RequireAuth roles={['User Management']}><UsersList /></RequireAuth>} />
        <Route path="/users/new" element={<RequireAuth roles={['User Management']}><UserForm /></RequireAuth>} />
        <Route path="/users/:id/edit" element={<RequireAuth roles={['User Management']}><UserForm /></RequireAuth>} />

        <Route path="/notifications" element={<Notifications />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
