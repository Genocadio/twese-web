'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  Clock3,
  KeyRound,
  MapPin,
  ShieldCheck,
  Truck,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import { fetchPackageById, toPackageItem } from '@/lib/api'
import {
  ACCEPTOR_LABEL,
  RULE_TONE,
  statusClass,
  statusLabel,
  TRANSFER_RULE_LABEL,
} from '@/lib/status'
import { formatTimestamp, timeAgo } from '@/lib/format'
import type { PackageItem } from '@/lib/types'
import { cn } from '@/lib/utils'

export function PackageDetail({ item, onClose }: { item: PackageItem | null; onClose: () => void }) {
  const { user, token } = useAuth()
  const workspace = useWorkspace()
  const [full, setFull] = useState<PackageItem | null>(null)
  const [busyCancel, setBusyCancel] = useState(false)

  // List queries return a slim field set (no events/custody/media) to keep the
  // workspace fast. When the drawer opens, fetch the full package so the
  // timeline, custody trail and photos render; keep the list item visible in
  // the meantime.
  useEffect(() => {
    setFull(null)
    if (!item || !token) return
    let cancelled = false
    fetchPackageById(token, item.id)
      .then(({ package: pkg }) => {
        if (!cancelled) setFull(toPackageItem(pkg, user?.id ?? ''))
      })
      .catch(() => {
        /* slim list data still renders — ignore enrichment failures */
      })
    return () => {
      cancelled = true
    }
  }, [item?.id, token, user?.id])

  if (!item) return null
  const pkg = full ?? item
  const meId = user?.id ?? ''
  const t = pkg.openTransfer

  return (
    <>
      {/* z-[70] — above the custody-inbox FAB (z-[60]) so the inbox stays open
          behind the drawer. */}
      <div className="fixed inset-0 z-[70] bg-foreground/20" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 left-0 z-[70] flex w-full max-w-xl flex-col border-r border-border bg-card shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Package detail</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{pkg.trackingCode}</h2>
              <Badge variant="outline" className={cn('text-[10px]', statusClass(pkg.status))}>{statusLabel(pkg.status)}</Badge>
              <Badge variant="outline" className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {pkg.deliveryType}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {pkg.receiver} · {pkg.destination}
            </p>
          </div>
          <button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 text-xs sm:grid-cols-2">
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sender</p><p className="mt-1 font-medium">{pkg.sender}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Receiver</p><p className="mt-1 font-medium">{pkg.receiver}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Origin</p><p className="mt-1 font-medium">{pkg.origin}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Destination</p><p className="mt-1 font-medium">{pkg.destination}</p></div>
            {pkg.weight && <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Weight</p><p className="mt-1 font-medium">{pkg.weight}</p></div>}
            {pkg.category && <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Category</p><p className="mt-1 font-medium">{pkg.category}</p></div>}
          </div>

          {pkg.description && (
            <p className="mt-4 rounded-xl border border-border p-3 text-xs leading-relaxed text-muted-foreground">{pkg.description}</p>
          )}

          {pkg.fragile && (
            <Badge variant="outline" className="mt-3 border-amber-200 bg-amber-50 text-[10px] text-amber-700">Fragile</Badge>
          )}

          {pkg.photos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Package photos</p>
              <div className="grid grid-cols-2 gap-2">
                {pkg.photos.map((photo) => (
                  <img key={photo} src={photo} alt={`Photo of ${pkg.trackingCode}`} className="h-28 w-full rounded-xl object-cover" />
                ))}
              </div>
            </div>
          )}

          {t && (
            <div className="mt-4 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <ShieldCheck className="size-3.5" /> Transfer
                </p>
                <Badge variant="outline" className={cn('text-[10px]', RULE_TONE[t.ruleType])}>{TRANSFER_RULE_LABEL[t.ruleType]}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t.creatorId === meId ? 'You created this transfer.' : 'Created by another custodian.'}{' '}
                Accepts: {ACCEPTOR_LABEL[t.acceptorType] ?? t.acceptorType}.
              </p>
              {t.status === 'PENDING' && t.creatorId === meId && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                  <Truck className="size-3.5" />
                  Transferred to the driver — waiting for them to accept the handover.
                </p>
              )}
              {t.status === 'REQUESTED' && t.creatorId === meId && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-violet-700">
                  <KeyRound className="size-3.5" />
                  The driver requested this transfer — approve it to continue.
                </p>
              )}
              {t.ruleType === 'SECURE' && t.creatorId === meId && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
                  <KeyRound className="size-3.5" />
                  {workspace.getSecureCode(t.id) ? `Code: ${workspace.getSecureCode(t.id)}` : 'Regenerate the code to view it.'}
                </p>
              )}
              {t.creatorId === meId && (t.status === 'PENDING' || t.status === 'REQUESTED') && (
                <div className="mt-3 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyCancel}
                    className="w-full gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={async () => {
                      setBusyCancel(true)
                      try {
                        await workspace.cancelTransfer(t.id)
                        onClose()
                      } finally {
                        setBusyCancel(false)
                      }
                    }}
                  >
                    <XCircle className="size-3.5" />
                    {busyCancel ? 'Cancelling...' : 'Cancel Transfer Offer (Recall)'}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="mt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <UserRound className="size-3.5" /> Current custody
            </p>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <span className="text-xs text-muted-foreground">Held by</span>
              <span className="text-xs font-medium">
                {pkg.currentCustodian ? `${pkg.currentCustodian.name} (${pkg.currentCustodian.role})` : 'No custodian'}
                {pkg.assignedDriver && pkg.currentCustodian?.role !== 'DRIVER' ? ` · ${pkg.assignedDriver}` : ''}
              </span>
            </div>
          </div>

          {pkg.custody.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <ArrowRight className="size-3.5" /> Custody trail
              </p>
              <div className="flex flex-col gap-2">
                {pkg.custody.map((entry) => (
                  <div key={entry.id} className="flex items-center gap-3 text-xs">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <Check className="size-3" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{entry.fromEntity} → {entry.toEntity}</span>
                      <span className="block text-[10px] text-muted-foreground">{timeAgo(entry.timestamp)} · {entry.notes ?? ''}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pkg.events.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Clock3 className="size-3.5" /> Timeline
              </p>
              <div className="flex flex-col gap-2">
                {pkg.events.map((event) => (
                  <div key={event.id} className="flex gap-3 text-xs">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="min-w-0">
                      <span className="block font-medium">{event.description ?? event.eventType}</span>
                      <span className="block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                        {event.eventType} · {formatTimestamp(event.createdAt)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pkg.status === 'PENDING_CONFIRMATION' && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">
              <MapPin className="mt-0.5 size-3.5 shrink-0" />
              <span>
                Delivery code issued to the receiver — awaiting confirmation.
              </span>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}