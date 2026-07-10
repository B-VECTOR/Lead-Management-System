import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSaveTaskDraft } from '@/hooks/useTasks'

// Renders a task's dynamic extra fields from the backend `field_schema`
// (Tech Req §4.6). Field types: text / number / date / boolean (Yes/No) /
// rowgroup (repeatable rows). A field carrying `required_when` is shown only
// once its controller field holds the required value (e.g. Task 5's fee /
// manpower fields appear once "Is Solution Blueprint required?" = Yes).
// "Save" is the workflow's Save-as-Draft — it persists values without closing.

function inputTypeFor(type) {
  return type === 'date' ? 'date' : type === 'number' ? 'number' : 'text'
}

function ScalarInput({ field, value, disabled, onChange }) {
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
  return (
    <Input
      type={inputTypeFor(field.type)}
      min={field.type === 'number' ? 0 : undefined}
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

export function TaskStepFields({ task, leadId, canEdit }) {
  const schema = task.field_schema || []
  const saveDraft = useSaveTaskDraft(leadId)
  const [values, setValues] = useState(() => initialValues(schema, task.extra_fields))

  // Re-seed whenever we switch to a different task or its saved values change.
  const savedKey = useMemo(() => `${task.id}:${JSON.stringify(task.extra_fields)}`, [task.id, task.extra_fields])
  useEffect(() => {
    setValues(initialValues(schema, task.extra_fields))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  if (schema.length === 0) return null

  const visibleFields = schema.filter((f) => isVisible(f, values))

  async function handleSave() {
    // Send only currently-visible fields; drop empty row-group rows.
    const payload = {}
    for (const f of visibleFields) {
      if (f.type === 'rowgroup') {
        const cols = f.columns || []
        const rows = (values[f.key] || []).filter((r) => cols.some((c) => String(r[c.key] ?? '').trim() !== ''))
        payload[f.key] = rows
      } else if (values[f.key] !== '' && values[f.key] != null) {
        payload[f.key] = values[f.key]
      }
    }
    await saveDraft.mutateAsync({ taskId: task.id, extraFields: payload })
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
}
