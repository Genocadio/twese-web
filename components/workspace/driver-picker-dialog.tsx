'use client'

import { useMemo, useState } from 'react'
import { Loader2, Search, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useWorkspace } from '@/lib/store'
import { displayName } from '@/lib/format'
import { cn } from '@/lib/utils'

export function DriverPickerDialog({
  open,
  title,
  description,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  description?: string
  onConfirm: (driverId: string) => Promise<void>
  onClose: () => void
}) {
  const { drivers } = useWorkspace()
  const [query, setQuery] = useState('')
  const [driverId, setDriverId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return drivers
    return drivers.filter((driver) => `${driver.firstName ?? ''} ${driver.lastName ?? ''} ${driver.email}`.toLowerCase().includes(q))
  }, [drivers, query])

  async function submit() {
    if (!driverId) return
    setBusy(true)
    try {
      await onConfirm(driverId)
      onClose()
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  function handleClose() {
    if (busy) return
    setDriverId(null)
    setQuery('')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Select a driver</p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search drivers…" className="h-11 pl-10 sm:h-9 sm:pl-9" />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
              {filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No drivers found.
                </p>
              ) : (
                filtered.map((driver) => (
                  <button
                    key={driver.id}
                    onClick={() => setDriverId(driver.id)}
                    className={cn(
                      'flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted/60',
                      driverId === driver.id && 'bg-muted',
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted">
                      <UserRound className="size-3.5 text-muted-foreground" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{displayName(driver)}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">{driver.email}</span>
                    </span>
                    {driverId === driver.id && <span className="ml-auto size-2 rounded-full bg-emerald-500" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
            disabled={!driverId || busy}
            onClick={() => void submit()}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
