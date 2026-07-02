import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { PriorityBadge } from '@/components/shared/StatusBadge'
import { UserChip } from '@/components/shared/UserChip'
import { useLeads, useUpdateLeadStatus } from '@/hooks/useLeads'
import { useProjects } from '@/hooks/useProjects'
import { useCompanies } from '@/hooks/useCompanies'
import { useUsers } from '@/hooks/useUsers'
import { LEAD_STATUSES, LOST_REASONS } from '@/mocks/seed'
import { formatCompactCurrency } from '@/lib/format'
import { toast } from 'sonner'

function LeadCard({ lead, company, owner, projectName }) {
  const navigate = useNavigate()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id })
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => !isDragging && navigate(`/leads/${lead.id}`)}
      className="cursor-grab rounded-md border bg-card p-3 text-sm shadow-sm active:cursor-grabbing"
    >
      <p className="font-medium">{company?.name}</p>
      <p className="text-xs text-muted-foreground">{lead.code} · {projectName || 'No project yet'}</p>
      <div className="mt-2 flex items-center justify-between">
        <PriorityBadge priority={lead.priority} />
        <span className="text-xs font-medium tabular-nums">{formatCompactCurrency(lead.acv, lead.currency)}</span>
      </div>
      <div className="mt-2"><UserChip user={owner} /></div>
    </div>
  )
}

function Column({ status, leads, companyById, userById, firstProjectByLead }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const total = leads.reduce((sum, l) => sum + (l.acv || 0), 0)

  return (
    <div ref={setNodeRef} className={`flex w-72 shrink-0 flex-col rounded-lg border bg-muted/40 ${isOver ? 'ring-2 ring-primary' : ''}`}>
      <div className="border-b px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">{status}</span>
          <span className="text-xs text-muted-foreground">{leads.length}</span>
        </div>
        <span className="text-xs text-muted-foreground">{formatCompactCurrency(total)}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} company={companyById[lead.company_id]} owner={userById[lead.owner_id]} projectName={firstProjectByLead[lead.id]?.name} />
        ))}
        {leads.length === 0 && <p className="p-2 text-center text-xs text-muted-foreground">Drop here</p>}
      </div>
    </div>
  )
}

export default function LeadsKanban() {
  const { data: leads = [] } = useLeads()
  const { data: companies = [] } = useCompanies()
  const { data: users = [] } = useUsers()
  const { data: projects = [] } = useProjects()
  const updateStatus = useUpdateLeadStatus()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [pendingMove, setPendingMove] = useState(null) // { lead, targetStatus }
  const [lostReason, setLostReason] = useState('')
  const [wonNotes, setWonNotes] = useState('')

  const companyById = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c])), [companies])
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users])
  const firstProjectByLead = useMemo(() => {
    const map = {}
    for (const p of projects) if (!map[p.lead_id]) map[p.lead_id] = p
    return map
  }, [projects])

  const columns = useMemo(
    () => LEAD_STATUSES.map((status) => ({ status, leads: leads.filter((l) => l.status === status) })),
    [leads]
  )

  function commitMove(lead, targetStatus, extra) {
    updateStatus.mutate(
      { id: lead.id, status: targetStatus, extra },
      { onSuccess: () => toast.success(`${lead.code} → ${targetStatus}`) }
    )
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over) return
    const lead = leads.find((l) => l.id === active.id)
    const targetStatus = over.id
    if (!lead || lead.status === targetStatus) return

    if (targetStatus === 'Closed Lost' || targetStatus === 'Closed Won') {
      setPendingMove({ lead, targetStatus })
      setLostReason('')
      setWonNotes('')
      return
    }
    commitMove(lead, targetStatus)
  }

  function confirmPendingMove() {
    if (!pendingMove) return
    const { lead, targetStatus } = pendingMove
    if (targetStatus === 'Closed Lost' && !lostReason) return
    commitMove(lead, targetStatus, targetStatus === 'Closed Lost' ? { lost_reason: lostReason } : { won_notes: wonNotes })
    setPendingMove(null)
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline board</h1>
        <p className="text-sm text-muted-foreground">Drag a card to move it between statuses.</p>
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <Column key={col.status} status={col.status} leads={col.leads} companyById={companyById} userById={userById} firstProjectByLead={firstProjectByLead} />
          ))}
        </div>
      </DndContext>

      <Dialog open={!!pendingMove} onOpenChange={(open) => !open && setPendingMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingMove?.targetStatus === 'Closed Lost' ? 'Mark as Closed Lost' : 'Mark as Closed Won'}
            </DialogTitle>
          </DialogHeader>
          {pendingMove?.targetStatus === 'Closed Lost' ? (
            <div className="flex flex-col gap-1.5">
              <Label>Lost reason *</Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger><SelectValue placeholder="Select a reason" /></SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label>Won notes</Label>
              <Textarea value={wonNotes} onChange={(e) => setWonNotes(e.target.value)} placeholder="Anything worth remembering about this win…" />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingMove(null)}>Cancel</Button>
            <Button onClick={confirmPendingMove} disabled={pendingMove?.targetStatus === 'Closed Lost' && !lostReason}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
