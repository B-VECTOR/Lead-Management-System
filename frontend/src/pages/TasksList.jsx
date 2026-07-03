import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Paperclip, Search } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserChip } from '@/components/shared/UserChip'
import { useAllChecklistItems, useUpdateChecklistItem } from '@/hooks/useChecklist'
import { useCompanies } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { useAuth } from '@/context/AuthContext'
import { useAttachments } from '@/hooks/useAttachments'
import { CHECKLIST_ITEM_STATUSES } from '@/mocks/seed'

function TaskRow({ item, company, assignee }) {
  const updateItem = useUpdateChecklistItem(item.lead_id)
  const { data: files = [] } = useAttachments('checklist_item', item.id)
  const isDone = item.state === 'done'
  const fileSatisfied = !item.requires_file || files.length > 0

  function setState(state) {
    if (state === 'done' && item.requires_file && !fileSatisfied) {
      toast.error('Upload the required file on the lead\'s Task tab before marking this complete.')
      return
    }
    updateItem.mutate({ id: item.id, patch: { state } })
  }

  return (
    <div className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${isDone ? 'text-muted-foreground line-through' : ''}`}>{item.label}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Link to={`/leads/${item.lead_id}`} className="hover:underline">{company?.name} · {item.lead_code}</Link>
          <span>· {item.task_name}</span>
          {item.requires_file && <Badge variant="outline" className="gap-1"><Paperclip className="size-3" /> File required</Badge>}
        </div>
      </div>
      <UserChip user={assignee} />
      <Select value={item.state} onValueChange={setState}>
        <SelectTrigger className="w-36 shrink-0" size="sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {CHECKLIST_ITEM_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value} disabled={s.value === 'done' && item.requires_file && !fileSatisfied}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export default function TasksList() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('open')
  const [assignedTo, setAssignedTo] = useState('all')

  const { data: items = [], isLoading } = useAllChecklistItems({ q, status, assignedTo: assignedTo === 'all' ? undefined : assignedTo })
  const { data: companies = [] } = useCompanies()
  const { data: users = [] } = useUsers()

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const reps = useMemo(() => users.filter((u) => u.role === 'Representative'), [users])

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="text-sm text-muted-foreground">
          {user.role === 'Representative' ? 'Checklist items assigned to you, across all your leads.' : 'Checklist items across leads in your scope.'}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search tasks or Lead ID…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="done">Done</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          {user.role !== 'Representative' && (
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Assigned to" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                {reps.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col divide-y p-0">
          {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && items.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No tasks match your filters.</p>}
          {items.map((item) => (
            <TaskRow key={item.id} item={item} company={companyById[item.company_id]} assignee={userById[item.assigned_to]} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
