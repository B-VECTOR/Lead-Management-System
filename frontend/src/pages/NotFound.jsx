import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-24 text-center">
      <p className="text-6xl font-semibold text-muted-foreground/40">404</p>
      <p className="text-lg font-medium">Page not found</p>
      <Button asChild><Link to="/dashboard">Back to dashboard</Link></Button>
    </div>
  )
}
