import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'

// Shared footer for a server-paginated table (R25).
//
// Deliberately verbose for this app's audience: the range ("1–50 of 1,284") and
// **numbered page buttons** are both there because these users click a page
// number, not a bare chevron, and want to see where they are in the set. Arrows
// alone would be smaller and worse. Rows-per-page sits on the same line so the
// whole control is one strip under the table.

const PAGE_SIZES = [25, 50, 100, 200]

// Page numbers to show: always first and last, the current page and a neighbour
// either side, with `null` marking an elided run.
function pageItems(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const items = new Set([1, pageCount, page])
  if (page - 1 > 1) items.add(page - 1)
  if (page + 1 < pageCount) items.add(page + 1)
  // Keep the ends walkable: with the current page in the middle, show the
  // second/second-to-last so there is never a lone jump from 1 to 47.
  if (page <= 3) [2, 3, 4].forEach((n) => items.add(n))
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((n) => items.add(n))
  const sorted = [...items].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b)
  const out = []
  let prev = 0
  for (const n of sorted) {
    if (n - prev > 1) out.push(null)
    out.push(n)
    prev = n
  }
  return out
}

export default function Pagination({
  page,
  pageCount,
  pageSize,
  count,
  onPageChange,
  onPageSizeChange,
  label = 'rows',
}) {
  const first = count === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, count)
  const go = (n) => onPageChange(Math.min(Math.max(n, 1), pageCount))

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-sm">
      <p className="text-muted-foreground">
        {count === 0 ? (
          `No ${label}`
        ) : (
          <>
            <span className="font-medium text-foreground tabular-nums">{first.toLocaleString()}–{last.toLocaleString()}</span>
            {' of '}
            <span className="font-medium text-foreground tabular-nums">{count.toLocaleString()}</span> {label}
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="hidden text-muted-foreground sm:inline">Rows per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[72px] text-xs">{pageSize}</SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="size-8" onClick={() => go(1)} disabled={page <= 1} aria-label="First page">
            <ChevronsLeft className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft className="size-4" />
          </Button>

          {/* Numbered pages: hidden on the narrowest screens, where the page
              indicator below carries the same information in less space. */}
          <div className="hidden items-center gap-1 sm:flex">
            {pageItems(page, pageCount).map((n, i) =>
              n === null ? (
                <span key={`gap-${i}`} className="px-1 text-muted-foreground">…</span>
              ) : (
                <Button
                  key={n}
                  variant={n === page ? 'default' : 'outline'}
                  size="icon"
                  className={cn('size-8 tabular-nums', n === page && 'pointer-events-none')}
                  onClick={() => go(n)}
                  aria-current={n === page ? 'page' : undefined}
                >
                  {n}
                </Button>
              ),
            )}
          </div>
          <span className="px-1 text-muted-foreground tabular-nums sm:hidden">
            {page} / {pageCount}
          </span>

          <Button variant="outline" size="icon" className="size-8" onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label="Next page">
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="outline" size="icon" className="size-8" onClick={() => go(pageCount)} disabled={page >= pageCount} aria-label="Last page">
            <ChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
