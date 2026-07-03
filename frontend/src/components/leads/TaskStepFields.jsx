import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLeadTaskFields, useUpdateLeadTaskFieldValue } from '@/hooks/useChecklist'

// Fixed input fields for the active step — a constant shape defined on the
// step's template (§7.1), not a checklist. Always shown for the step
// regardless of checklist progress; just data entry (e.g. contract value).
// Values are edited locally and only written back on "Save" — no silent
// autosave, so it's clear when the data has actually been submitted.
export function TaskStepFields({ taskId, canUpdate }) {
  const { data: fields = [] } = useLeadTaskFields(taskId)
  const updateValue = useUpdateLeadTaskFieldValue(taskId)
  const [values, setValues] = useState({})

  const fieldsKey = useMemo(() => fields.map((f) => `${f.id}:${f.field_value}`).join('|'), [fields])

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.id, f.field_value])))
    // Re-sync whenever the server-side values for this step actually change
    // (switching steps, or right after a successful save) — not on every
    // unrelated re-render, so it never clobbers an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, fieldsKey])

  if (fields.length === 0) return null

  const isDirty = fields.some((f) => values[f.id] !== f.field_value)

  async function handleSave() {
    const changed = fields.filter((f) => values[f.id] !== f.field_value)
    if (changed.length === 0) return
    await Promise.all(changed.map((f) => updateValue.mutateAsync({ fieldId: f.id, value: values[f.id] })))
    toast.success('Details saved')
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Additional details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <Label className="text-xs">{f.field_name}</Label>
            <Input
              value={values[f.id] ?? ''}
              disabled={!canUpdate}
              onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
            />
          </div>
        ))}
      </CardContent>
      {canUpdate && (
        <CardFooter className="justify-end">
          <Button size="sm" onClick={handleSave} disabled={!isDirty || updateValue.isPending}>
            {updateValue.isPending ? 'Saving…' : 'Save'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
