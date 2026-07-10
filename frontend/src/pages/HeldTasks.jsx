import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useHeldTasks, useUnholdTask } from '@/hooks/useHolds'

// "Held Tasks" menu (Tech Req §6 / PRD §5.8) — every task currently on hold
// that the signed-in user can see. Unhold returns a task to normal edit
// behaviour for its assignee.
export default function HeldTasks() {
  const navigate = useNavigate()
  const { data: tasks = [], isLoading } = useHeldTasks()
  const unhold = useUnholdTask()
  const columnCount = 5

  function handleUnhold(task) {
    unhold.mutate(
      { taskId: task.id, leadId: task.lead },
      {
        onSuccess: () => toast.success('Task resumed'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Held Tasks</h1>
        <p className="text-sm text-muted-foreground">Tasks currently on hold. A held task cannot be edited until it is resumed.</p>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Task</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Assigned to</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && tasks.length === 0 && (
                <TableRow><TableCell colSpan={columnCount} className="py-8 text-center text-muted-foreground">No tasks are on hold.</TableCell></TableRow>
              )}
              {tasks.map((task) => (
                <TableRow key={task.id} className="cursor-pointer" onClick={() => navigate(`/leads/${task.lead}`)}>
                  <TableCell>
                    <span className="text-muted-foreground">Task {task.task_no}.</span> {task.task_name}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{task.lead_project_name}</span>
                    <span className="text-muted-foreground"> · {task.lead_company_name}</span>
                  </TableCell>
                  <TableCell className="text-sm">{task.assigned_to_name || <span className="text-muted-foreground">Not assigned</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{task.opened_at ? new Date(task.opened_at).toLocaleDateString() : '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={unhold.isPending}
                      onClick={(e) => { e.stopPropagation(); handleUnhold(task) }}
                    >
                      <PlayCircle className="size-4" /> Unhold
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
