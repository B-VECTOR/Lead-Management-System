import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLeadTaskFields, useUpdateLeadTaskFieldValue } from '@/hooks/useChecklist'

function safeParseRows(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function FieldInput({ field, value, disabled, onChange }) {
  if (field.field_type === 'boolean') {
    return (
      <Select value={value || undefined} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
        <SelectTrigger className="w-full"><SelectValue placeholder="Select…" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Yes">Yes</SelectItem>
          <SelectItem value="No">No</SelectItem>
        </SelectContent>
      </Select>
    )
  }
  const inputType = field.field_type === 'date' ? 'date' : field.field_type === 'number' ? 'number' : 'text'
  return <Input type={inputType} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
}

// A repeatable block of rows sharing a fixed set of columns (e.g. "Key
// stakeholders mapped": Name | Role; "Invoices raised": Invoice Number |
// Value | Date) — starts with the template's default row count, "Add row"
// grows it. Supplementary data: never blocks a step from completing.
function RepeatableGroupInput({ columns, rows, disabled, onChange }) {
  function updateCell(rowIdx, key, val) {
    onChange(rows.map((r, i) => (i === rowIdx ? { ...r, [key]: val } : r)))
  }
  function addRow() {
    onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))])
  }
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((c) => <th key={c.key} className="p-2 text-left font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="p-2 text-center text-xs text-muted-foreground">No rows yet.</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className="p-1.5">
                    <Input
                      type={c.type === 'date' ? 'date' : c.type === 'number' ? 'number' : 'text'}
                      value={row[c.key] ?? ''}
                      disabled={disabled}
                      onChange={(e) => updateCell(i, c.key, e.target.value)}
                      className="h-8"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <Button type="button" size="sm" variant="outline" className="w-fit" onClick={addRow}>
          <Plus className="size-3.5" /> Add row
        </Button>
      )}
    </div>
  )
}

function isFieldVisible(field, fields, values) {
  if (!field.visible_if_field_id) return true
  const controller = fields.find((f) => f.source_field_id === field.visible_if_field_id)
  if (!controller) return true
  return values[controller.id] === field.visible_if_value
}

// Fixed input fields for the active step — a constant shape defined on the
// step's template (§7.1), not a checklist. Always shown for the step
// regardless of checklist progress; just data entry (e.g. contract value).
// Some fields only appear once another field in the same step has a
// specific value (visible_if_field_id/visible_if_value, § BD flow rework —
// e.g. fee/manpower fields only show once "Is Solution Blueprint Required?"
// is Yes); that reveal reacts live to unsaved edits, not just the last-saved
// value. Values are edited locally and only written back on "Save" — no
// silent autosave, so it's clear when the data has actually been submitted.
export function TaskStepFields({ taskId, leadId, canUpdate }) {
  const { data: fields = [] } = useLeadTaskFields(taskId)
  const updateValue = useUpdateLeadTaskFieldValue(taskId, leadId)
  const [values, setValues] = useState({})

  const fieldsKey = useMemo(() => fields.map((f) => `${f.id}:${f.field_value}`).join('|'), [fields])

  useEffect(() => {
    setValues(Object.fromEntries(fields.map((f) => [f.id, f.field_type === 'repeatable_group' ? safeParseRows(f.field_value) : f.field_value])))
    // Re-sync whenever the server-side values for this step actually change
    // (switching steps, or right after a successful save) — not on every
    // unrelated re-render, so it never clobbers an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, fieldsKey])

  if (fields.length === 0) return null

  const visibleFields = fields.filter((f) => isFieldVisible(f, fields, values))

  function valueChanged(f) {
    return f.field_type === 'repeatable_group'
      ? JSON.stringify(values[f.id] ?? []) !== f.field_value
      : values[f.id] !== f.field_value
  }
  const isDirty = visibleFields.some(valueChanged)

  async function handleSave() {
    const changed = visibleFields.filter(valueChanged)
    if (changed.length === 0) return
    await Promise.all(changed.map((f) => updateValue.mutateAsync({
      fieldId: f.id,
      value: f.field_type === 'repeatable_group' ? JSON.stringify(values[f.id] ?? []) : values[f.id],
    })))
    toast.success('Details saved')
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Additional details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleFields.map((f) => (
          <div key={f.id} className={`flex flex-col gap-1.5 ${f.field_type === 'repeatable_group' ? 'sm:col-span-2' : ''}`}>
            <Label className="text-xs">{f.field_name}</Label>
            {f.field_type === 'repeatable_group' ? (
              <RepeatableGroupInput
                columns={f.columns || []}
                rows={values[f.id] || []}
                disabled={!canUpdate}
                onChange={(rows) => setValues((v) => ({ ...v, [f.id]: rows }))}
              />
            ) : (
              <FieldInput
                field={f}
                value={values[f.id]}
                disabled={!canUpdate}
                onChange={(val) => setValues((v) => ({ ...v, [f.id]: val }))}
              />
            )}
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
