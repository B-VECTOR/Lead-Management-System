import { useState } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'

// Single search/select/create control for picking a company — replaces a
// separate dropdown + "New company" dialog so there's exactly one place to
// type a company name (and only one Industry field, on the parent Lead form).
export function CompanyCombobox({ companies, value, onSelect, onCreate }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = companies.find((c) => c.id === value)
  const exactMatch = companies.some((c) => c.name.toLowerCase() === query.trim().toLowerCase())

  function handleSelect(company) {
    onSelect(company)
    setOpen(false)
    setQuery('')
  }

  function handleCreate() {
    onCreate(query.trim())
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal">
          {selected ? selected.name : 'Search or add a company…'}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search companies…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandGroup>
              {companies
                .filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
                .map((c) => (
                  <CommandItem key={c.id} value={c.id} onSelect={() => handleSelect(c)}>
                    <Check className={cn('size-4', value === c.id ? 'opacity-100' : 'opacity-0')} />
                    {c.name}
                  </CommandItem>
                ))}
            </CommandGroup>
            {query.trim() && !exactMatch && (
              <CommandGroup>
                <CommandItem value={`create-${query}`} onSelect={handleCreate}>
                  <Plus className="size-4" /> Create "{query.trim()}"
                </CommandItem>
              </CommandGroup>
            )}
            {query.trim() === '' && companies.length === 0 && (
              <CommandEmpty>No companies yet — type a name to add one.</CommandEmpty>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
