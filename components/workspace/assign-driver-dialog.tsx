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

export function AssignDriverDialog({
  open,
  packageId,
  packageCode,
  onClose,
}: {
  open: boolean
  packageId: string
  packageCode: string
  onClose: () => void
}) {
  const { drivers, assignDriver } = useWorkspace()
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
      await assignDriver(packageId, driverId)
      onClose()
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign driver</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{packageCode}</span> — custody moves from you to the driver.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Drivers</p>
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
                    {driver.driverStatus && (
                      <span className={`ml-auto text-[10px] font-medium ${driver.driverStatus === 'ONLINE' ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                        {driver.driverStatus === 'ONLINE' ? 'Online' : 'Offline'}
                      </span>
                    )}
                    {driverId === driver.id && <span className="ml-auto size-2 rounded-full bg-emerald-500" />}
                  </button>
                ))
              )}
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            All drivers can be assigned. Online/offline status is shown as a reference.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            className="gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
            disabled={!driverId || busy}
            onClick={() => void submit()}
          >
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Assign driver
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
