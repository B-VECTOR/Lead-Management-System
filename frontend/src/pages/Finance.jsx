import { Sparkles } from 'lucide-react'

export default function Finance() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
      <Sparkles className="size-12 text-muted-foreground/40" />
      <p className="text-lg font-medium">Coming soon</p>
      <p className="text-sm text-muted-foreground">The Finance page isn't ready yet — check back later.</p>
    </div>
  )
}
