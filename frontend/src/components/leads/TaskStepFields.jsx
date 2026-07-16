import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSaveTaskDraft } from '@/hooks/useTasks'
import { useLead } from '@/hooks/useLeads'

const TODAY_ISO = new Date().toISOString().slice(0, 10)

// Per-field past-date floor for the date picker's `min` (mirrors the backend
// engine, Phase 11): the "expected start date of next stage" may go back to the
// lead's creation date; every other date field is floored at today.
function dateMinFor(field, leadCreatedDate) {
  if (field.key === 'expected_start_date' && leadCreatedDate) return leadCreatedDate
  return TODAY_ISO
}

// Renders a task's dynamic extra fields from the backend `field_schema`
// (Tech Req §4.6). Field types: text / number / date / boolean (Yes/No) /
// rowgroup (repeatable rows). A field carrying `required_when` is shown only
// once its controller field holds the required value (e.g. Task 5's fee /
// manpower fields appear once "Is Solution Blueprint required?" = Yes).
// "Save" is the workflow's Save-as-Draft — it persists values without closing.

function inputTypeFor(type) {
  return type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'
}

function ScalarInput({ field, value, disabled, onChange, dateMin }) {
  if (field.type === 'boolean') {
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
  const min = field.type === 'number' ? 0 : field.type === 'date' ? dateMin : undefined
  const max = field.type === 'number' ? field.max : undefined
  return (
    <Input
      type={inputTypeFor(field.type)}
      min={min}
      max={max}
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function RowGroupInput({ field, rows, disabled, onChange }) {
  const columns = field.columns || []
  function updateCell(rowIdx, key, val) {
    onChange(rows.map((r, i) => (i === rowIdx ? { ...r, [key]: val } : r)))
  }
  function addRow() {
    onChange([...rows, Object.fromEntries(columns.map((c) => [c.key, '']))])
  }
  function removeRow(idx) {
    onChange(rows.filter((_, i) => i !== idx))
  }
  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((c) => <th key={c.key} className="p-2 text-left font-medium">{c.label}</th>)}
              {!disabled && <th className="w-10 p-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="p-2 text-center text-xs text-muted-foreground">No rows yet.</td></tr>
            )}
            {rows.map((row, i) => (
              <tr key={i} className="border-b last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className="p-1.5">
                    <Input
                      type={inputTypeFor(c.type)}
                      min={c.type === 'number' ? 0 : undefined}
                      value={row[c.key] ?? ''}
                      disabled={disabled}
                      onChange={(e) => updateCell(i, c.key, e.target.value)}
                      className="h-8"
                    />
                  </td>
                ))}
                {!disabled && (
                  <td className="p-1.5 text-right">
                    <Button type="button" size="icon-sm" variant="ghost" onClick={() => removeRow(i)} title="Remove row">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                )}
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

function isVisible(field, values) {
  const cond = field.required_when
  if (!cond) return true
  return values[cond.field] === cond.equals
}

function isRequired(field, values) {
  if (field.required) return true
  const cond = field.required_when
  return !!cond && values[cond.field] === cond.equals
}

// Seed local edit state from the task's saved values, defaulting row-groups to
// their template's min_rows of empty rows so the table isn't blank.
function initialValues(schema, saved) {
  const out = {}
  for (const f of schema) {
    if (f.type === 'rowgroup') {
      const rows = Array.isArray(saved?.[f.key]) ? saved[f.key] : []
      const minRows = f.min_rows || 0
      const cols = f.columns || []
      const padded = [...rows]
      while (padded.length < minRows) padded.push(Object.fromEntries(cols.map((c) => [c.key, ''])))
      out[f.key] = padded
    } else {
      out[f.key] = saved?.[f.key] ?? ''
    }
  }
  return out
}

export const TaskStepFields = forwardRef(function TaskStepFields({ task, leadId, canEdit }, ref) {
  const schema = task.field_schema || []
  const saveDraft = useSaveTaskDraft(leadId)
  const { data: lead } = useLead(leadId)
  const leadCreatedDate = lead?.created_at ? String(lead.created_at).slice(0, 10) : null
  const [values, setValues] = useState(() => initialValues(schema, task.extra_fields))

  // Re-seed whenever we switch to a different task or its saved values change.
  const savedKey = useMemo(() => `${task.id}:${JSON.stringify(task.extra_fields)}`, [task.id, task.extra_fields])
  useEffect(() => {
    setValues(initialValues(schema, task.extra_fields))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  const visibleFields = schema.filter((f) => isVisible(f, values))

  function buildPayload() {
    // Merge into whatever was already saved rather than replacing the whole
    // blob: the PATCH overwrites `extra_fields` wholesale, so if we only sent
    // currently-*visible* fields a value previously entered for a field that is
    // momentarily hidden (its `required_when` controller was toggled) would be
    // silently dropped. Start from the saved values, then overlay the visible
    // fields — setting a filled value, or removing a visible-but-cleared one.
    const payload = { ...(task.extra_fields || {}) }
    for (const f of visibleFields) {
      if (f.type === 'rowgroup') {
        const cols = f.columns || []
        const rows = (values[f.key] || []).filter((r) => cols.some((c) => String(r[c.key] ?? '').trim() !== ''))
        payload[f.key] = rows
      } else if (values[f.key] !== '' && values[f.key] != null) {
        payload[f.key] = values[f.key]
      } else {
        delete payload[f.key]
      }
    }
    return payload
  }

  // Exposed so "Save & Complete" (LeadTaskTab) can persist whatever is
  // currently typed here first — this form's values only ever reached the
  // server via its own "Save as Draft" button, so completing without
  // drafting first closed against stale/empty data (Phase 9 bug fix).
  useImperativeHandle(ref, () => ({
    saveDraft: async () => {
      if (schema.length === 0) return
      await saveDraft.mutateAsync({ taskId: task.id, extraFields: buildPayload() })
    },
  }))

  if (schema.length === 0) return null

  async function handleSave() {
    await saveDraft.mutateAsync({ taskId: task.id, extraFields: buildPayload() })
    toast.success('Details saved')
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Additional details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {visibleFields.map((f) => (
          <div key={f.key} className={`flex flex-col gap-1.5 ${f.type === 'rowgroup' ? 'sm:col-span-2' : ''}`}>
            <Label className="text-xs">
              {f.label}
              {isRequired(f, values) && <span className="ml-0.5 text-red-500">*</span>}
            </Label>
            {f.type === 'rowgroup' ? (
              <RowGroupInput
                field={f}
                rows={values[f.key] || []}
                disabled={!canEdit}
                onChange={(rows) => setValues((v) => ({ ...v, [f.key]: rows }))}
              />
            ) : (
              <ScalarInput
                field={f}
                value={values[f.key]}
                disabled={!canEdit}
                dateMin={dateMinFor(f, leadCreatedDate)}
                onChange={(val) => setValues((v) => ({ ...v, [f.key]: val }))}
              />
            )}
          </div>
        ))}
      </CardContent>
      {canEdit && (
        <CardFooter className="justify-end">
          <Button size="sm" variant="outline" onClick={handleSave} disabled={saveDraft.isPending}>
            {saveDraft.isPending ? 'Saving…' : 'Save as Draft'}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
})
