import * as React from "react"

import { cn } from "@/lib/utils"

interface ProgressProps extends React.ComponentProps<"div"> {
  value?: number
}

function Progress({ className, value = 0, ...props }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        "bg-muted relative h-2 w-full overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      <div
        className="bg-primary h-full rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
