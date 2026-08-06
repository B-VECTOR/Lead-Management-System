import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { SessionTimeoutDialog } from './SessionTimeoutDialog'
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed'
import { cn } from '@/lib/utils'

export function AppShell() {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()

  return (
    <div className="flex h-full w-full overflow-hidden bg-muted/30">
      {/* Idle-session timeout (R26) — lives here so it covers every
          authenticated screen and none of the public ones. */}
      <SessionTimeoutDialog />
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        className={cn('hidden shrink-0 border-r bg-background transition-[width] duration-200 lg:flex', collapsed ? 'w-16' : 'w-60')}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
