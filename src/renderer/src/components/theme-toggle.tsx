import { useEffect, useState } from "react"
import { Moon, Sun } from "lucide-react"

import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains("dark")
  )

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    try {
      localStorage.setItem("pos-theme", dark ? "dark" : "light")
    } catch {
      /* ignore */
    }
  }, [dark])

  return (
    <button
      type="button"
      onClick={() => setDark((d) => !d)}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "flex items-center justify-center w-8 h-8 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors",
        className
      )}
    >
      {dark ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </button>
  )
}
