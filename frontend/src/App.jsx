import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { RequireAuth } from '@/components/layout/RequireAuth'
import { canSeeLeadModule, canSeeLeadsList, canSeeLeadDetail, canSeeFollowUps, canSeeHeldLeads, canSeeHeldTasks, canSeeResources } from '@/api/scope'
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
import MyResourceTasks from '@/pages/MyResourceTasks'
import ResourceHistory from '@/pages/ResourceHistory'
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

        {/* R13-1: the list is open to the Lead module **and** the Resource
            Manager again (R10-1 restored) — they staff from either the lead's
            task stepper or the `/resources` queue, both of which render the same
            `AllocationPanel`. Read-only for the role: create/edit stay gated. */}
        <Route path="/leads" element={<RequireAuth check={canSeeLeadsList}><LeadsList /></RequireAuth>} />
        <Route path="/leads/new" element={<RequireAuth check={canSeeLeadModule}><LeadForm /></RequireAuth>} />
        {/* Detail is open to any authenticated user — the backend scopes lead
            visibility, so a task worker (e.g. the assigned Red), a Finance user
            working a payment gate, or the Resource Manager working an allocation
            step can open a lead they're entitled to; others get a not-found
            state. The Leads *list* and edit stay gated. */}
        <Route path="/leads/:id" element={<RequireAuth check={canSeeLeadDetail}><LeadDetail /></RequireAuth>} />
        <Route path="/leads/:id/edit" element={<RequireAuth check={canSeeLeadModule}><LeadForm /></RequireAuth>} />

        <Route path="/other-tasks" element={<RequireAuth check={canSeeFollowUps}><OtherTasks /></RequireAuth>} />

        <Route path="/held-leads" element={<RequireAuth check={canSeeHeldLeads}><HeldLeads /></RequireAuth>} />
        <Route path="/held-tasks" element={<RequireAuth check={canSeeHeldTasks}><HeldTasks /></RequireAuth>} />

        {/* R9-3: the resource module is the Resource Manager's own — the
            cross-lead queue is gated to them (`canSeeResources`). Staffing is
            reachable from both here and a lead's task stepper (R13-1); a lead's
            Default BD Person only gets the stepper route (D12). */}
        <Route path="/resources" element={<RequireAuth check={canSeeResources}><MyResourceTasks /></RequireAuth>} />
        <Route path="/resource-history" element={<RequireAuth roles={['Resource Manager']}><ResourceHistory /></RequireAuth>} />
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
