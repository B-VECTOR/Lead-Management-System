import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCompanies, useCreateCompany } from '@/hooks/useCompanies'
import { useLeads } from '@/hooks/useLeads'
import { useAuth } from '@/context/AuthContext'

const INDUSTRIES = ['Retail', 'Healthcare', 'Finance', 'Logistics', 'Education', 'Manufacturing', 'Government', 'SaaS/Tech', 'Other']

export default function Companies() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: companies = [] } = useCompanies()
  const { data: leads = [] } = useLeads()
  const [q, setQ] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', industry: '', size: 'SMB', location: '', website: '' })
  const createCompany = useCreateCompany()

  const leadCountByCompany = useMemo(() => {
    const map = {}
    for (const l of leads) map[l.company_id] = (map[l.company_id] || 0) + 1
    return map
  }, [leads])

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(q.toLowerCase()))

  async function handleCreate() {
    const created = await createCompany.mutateAsync(form)
    setCreateOpen(false)
    setForm({ name: '', industry: '', size: 'SMB', location: '', website: '' })
    navigate(`/companies/${created.id}`)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">Client accounts and their lead history.</p>
        </div>
        {(user.role === 'Admin' || user.role === 'Manager') && (
          <Button onClick={() => setCreateOpen(true)}><Plus className="size-4" /> New company</Button>
        )}
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-sm">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search companies…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/companies/${c.id}`)}>
                  <TableCell><Link to={`/companies/${c.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{c.name}</Link></TableCell>
                  <TableCell><Badge variant="outline">{c.industry}</Badge></TableCell>
                  <TableCell>{c.size}</TableCell>
                  <TableCell className="text-muted-foreground">{c.location}</TableCell>
                  <TableCell className="text-right">{leadCountByCompany[c.id] || 0}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No companies found.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New company</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5">
              <Label>Industry *</Label>
              <Select value={form.industry} onValueChange={(v) => setForm((f) => ({ ...f, industry: v }))}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Size</Label>
              <Select value={form.size} onValueChange={(v) => setForm((f) => ({ ...f, size: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SMB">SMB</SelectItem>
                  <SelectItem value="Mid">Mid</SelectItem>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5"><Label>Location</Label><Input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} /></div>
            <div className="flex flex-col gap-1.5"><Label>Website</Label><Input value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!form.name || !form.industry}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
