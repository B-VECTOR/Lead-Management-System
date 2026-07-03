import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'lms-sidebar-collapsed'

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(collapsed))
  }, [collapsed])

  const toggle = useCallback(() => setCollapsed((c) => !c), [])

  return [collapsed, toggle]
}
