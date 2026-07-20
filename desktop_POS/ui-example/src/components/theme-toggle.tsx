'use client'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-slate-200" title="Theme">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-[var(--pos-elev)] border-[var(--pos-border)]">
        <DropdownMenuItem onClick={() => setTheme('light')} className={`text-sm cursor-pointer ${theme === 'light' ? 'bg-teal-500/10 text-teal-500' : 'text-[var(--pos-text)]'}`}>
          <Sun className="w-4 h-4 mr-2" /> Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')} className={`text-sm cursor-pointer ${theme === 'dark' ? 'bg-teal-500/10 text-teal-500' : 'text-[var(--pos-text)]'}`}>
          <Moon className="w-4 h-4 mr-2" /> Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')} className={`text-sm cursor-pointer ${theme === 'system' ? 'bg-teal-500/10 text-teal-500' : 'text-[var(--pos-text)]'}`}>
          <Monitor className="w-4 h-4 mr-2" /> System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
