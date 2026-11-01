'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Clock3,
  Copy,
  ExternalLink,
  KeyRound,
  MapPin,
  Package,
  Send,
  ShieldCheck,
  Truck,
  User,
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

export function PackageDetail({
  item,
  onClose,
  inline = false,
  onDeliver,
  onConfirmDelivery,
  onTransferToDriver,
}: {
  item: PackageItem | null
  onClose: () => void
  inline?: boolean
  onDeliver?: (item: PackageItem) => void
  onConfirmDelivery?: (item: PackageItem) => void
  onTransferToDriver?: (item: PackageItem) => void
}) {
  const { user, token } = useAuth()
  const workspace = useWorkspace()
  const [full, setFull] = useState<PackageItem | null>(null)
  const [busyCancel, setBusyCancel] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null)

  // Fetch full details (timeline, custody trail, media) on selection
  useEffect(() => {
    setFull(null)
    if (!item || !token || token === 'demo-token') return
    let cancelled = false
    fetchPackageById(token, item.id)
      .then(({ package: pkg }) => {
        if (!cancelled) setFull(toPackageItem(pkg, user?.id ?? ''))
      })
      .catch(() => {
        /* slim list data still renders */
      })
    return () => {
      cancelled = true
    }
  }, [item?.id, token, user?.id])

  if (!item) return null
  const pkg = full ?? item
  const meId = user?.id ?? ''
  const t = pkg.openTransfer

  const officeDeliver = (p: PackageItem) =>
    ['DESTINATION_OFFICE', 'READY_FOR_COLLECTION'].includes(p.status)
  const awaitingConfirm = (p: PackageItem) => p.status === 'PENDING_CONFIRMATION'
  const canTransfer = (p: PackageItem) =>
    (p.isMine || p.currentCustodian?.role === 'OFFICE' || p.currentCustodian?.role === 'WORKER') &&
    ['CREATED', 'ORIGIN_OFFICE', 'ACCEPTED'].includes(p.status) &&
    !p.openTransfer

  function copyTrackingCode() {
    if (!pkg.trackingCode) return
    void navigator.clipboard.writeText(pkg.trackingCode)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const content = (
    <div className="flex h-full w-full flex-col overflow-hidden bg-card/40">
      {/* Detail Header Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border bg-card/90 px-4 py-3 backdrop-blur-xs sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Back button for mobile view */}
          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg border border-border text-muted-foreground transition-all hover:bg-muted hover:text-foreground md:hidden cursor-pointer"
            aria-label="Back to packages"
          >
            <ChevronLeft className="size-4" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold tracking-tight text-foreground sm:text-lg">
                {pkg.trackingCode}
              </span>
              <button
                type="button"
                onClick={copyTrackingCode}
                title="Copy tracking code"
                className="grid size-7 place-items-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer"
              >
                {copiedCode ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </button>
              <Badge variant="outline" className={cn('text-[11px] font-semibold', statusClass(pkg.status))}>
                {statusLabel(pkg.status)}
              </Badge>
              <Badge variant="outline" className="hidden font-mono text-[10px] uppercase text-muted-foreground sm:inline-flex">
                {pkg.deliveryType}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {pkg.receiver} · {pkg.origin} → {pkg.destination}
            </p>
          </div>
        </div>

        {/* Quick action buttons & Close */}
        <div className="flex items-center gap-2">
          {officeDeliver(pkg) && onDeliver && (
            <Button
              size="sm"
              onClick={() => onDeliver(pkg)}
              className="gap-1.5 bg-[#f07c42] font-semibold text-white hover:bg-[#e3743e] interactive-btn"
            >
              <Send className="size-3.5" /> Deliver
            </Button>
          )}

          {awaitingConfirm(pkg) && onConfirmDelivery && (
            <Button
              size="sm"
              onClick={() => onConfirmDelivery(pkg)}
              className="gap-1.5 bg-[#1f2523] font-semibold text-white hover:bg-[#343b37] interactive-btn"
            >
              <KeyRound className="size-3.5" /> Enter code
            </Button>
          )}

          {canTransfer(pkg) && onTransferToDriver && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onTransferToDriver(pkg)}
              className="gap-1.5 interactive-btn"
            >
              <Truck className="size-3.5" /> Transfer to driver
            </Button>
          )}

          <button
            onClick={onClose}
            className="grid size-8 place-items-center rounded-lg border border-border/80 text-muted-foreground transition-all hover:bg-muted hover:text-foreground cursor-pointer"
            aria-label="Close package view"
            title="Close (Esc)"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Detail Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        {/* Route Card */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Route & Handover</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
                <MapPin className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Origin</p>
                <p className="mt-0.5 text-xs font-semibold text-foreground">{pkg.origin}</p>
                <p className="text-[11px] text-muted-foreground">Sender: {pkg.sender}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
              <div className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                <MapPin className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Destination</p>
                <p className="mt-0.5 text-xs font-semibold text-foreground">{pkg.destination}</p>
                <p className="text-[11px] text-muted-foreground">Receiver: {pkg.receiver}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sender & Receiver Card */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="size-3.5" /> Sender Information
            </div>
            <p className="mt-2 text-sm font-semibold">{pkg.sender}</p>
            <p className="mt-1 text-xs text-muted-foreground">Origin: {pkg.origin}</p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <UserRound className="size-3.5" /> Recipient Information
            </div>
            <p className="mt-2 text-sm font-semibold">{pkg.receiver}</p>
            <p className="mt-1 text-xs text-muted-foreground">Destination: {pkg.destination}</p>
          </div>
        </div>

        {/* Package Specifications Card */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Package Details</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pkg.weight && (
              <Badge variant="outline" className="border-border bg-muted/40 text-xs font-medium">
                Weight: {pkg.weight}
              </Badge>
            )}
            {pkg.category && (
              <Badge variant="outline" className="border-border bg-muted/40 text-xs font-medium">
                Category: {pkg.category}
              </Badge>
            )}
            {pkg.fragile && (
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-xs font-semibold text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-300">
                Fragile package
              </Badge>
            )}
            <Badge variant="outline" className="border-border bg-muted/40 text-xs font-mono">
              {pkg.deliveryType}
            </Badge>
          </div>

          {pkg.description && (
            <p className="mt-3 rounded-xl border border-border/80 bg-muted/30 p-3 text-xs leading-relaxed text-foreground/90">
              {pkg.description}
            </p>
          )}

          {pkg.photos.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Attached Photos ({pkg.photos.length})
              </p>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {pkg.photos.map((photo, index) => (
                  <button
                    key={photo}
                    type="button"
                    onClick={() => setSelectedPhoto(photo)}
                    className="group relative h-28 w-full overflow-hidden rounded-xl border border-border bg-muted transition-transform hover:scale-[1.02] cursor-pointer"
                  >
                    <img
                      src={photo}
                      alt={`Photo ${index + 1} of ${pkg.trackingCode}`}
                      className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/30 opacity-0 transition-opacity group-hover:opacity-100 grid place-items-center text-white">
                      <ExternalLink className="size-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Transfer Status Card */}
        {t && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <ShieldCheck className="size-3.5 text-primary" /> Active Transfer Handover
              </p>
              <Badge variant="outline" className={cn('text-[10px] font-semibold', RULE_TONE[t.ruleType])}>
                {TRANSFER_RULE_LABEL[t.ruleType]}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t.creatorId === meId ? 'You created this transfer offer.' : 'Created by another custodian.'}{' '}
              Recipient: <span className="font-semibold text-foreground">{ACCEPTOR_LABEL[t.acceptorType] ?? t.acceptorType}</span>
            </p>

            {t.status === 'PENDING' && t.creatorId === meId && (
              <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
                <Truck className="size-4 shrink-0" />
                <span>Transferred to the driver — waiting for them to accept the package.</span>
              </div>
            )}

            {t.status === 'REQUESTED' && t.creatorId === meId && (
              <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-800 dark:border-violet-800/40 dark:bg-violet-950/30 dark:text-violet-300">
                <KeyRound className="size-4 shrink-0" />
                <span>The driver requested this transfer — approve it to continue.</span>
              </div>
            )}

            {t.ruleType === 'SECURE' && t.creatorId === meId && (
              <div className="mt-2.5 flex items-center justify-between rounded-xl border border-border bg-muted/40 p-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <KeyRound className="size-3.5 text-amber-600" />
                  <span className="font-medium">Handover Code:</span>
                  <span className="font-mono font-bold tracking-wider text-foreground">
                    {workspace.getSecureCode(t.id) ?? '••••••••'}
                  </span>
                </div>
                {workspace.getSecureCode(t.id) && (
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      const code = workspace.getSecureCode(t.id)
                      if (code) void navigator.clipboard.writeText(code)
                    }}
                    className="gap-1 text-[11px]"
                  >
                    <Copy className="size-3" /> Copy
                  </Button>
                )}
              </div>
            )}

            {t.creatorId === meId && (t.status === 'PENDING' || t.status === 'REQUESTED') && (
              <div className="mt-3 border-t border-border pt-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyCancel}
                  className="w-full gap-1.5 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-800/40 dark:text-red-400 dark:hover:bg-red-950/30 interactive-btn"
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

        {/* Current Custody Card */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <UserRound className="size-3.5" /> Physical Custody
          </p>
          <div className="mt-2.5 flex items-center justify-between rounded-xl border border-border/80 bg-muted/30 p-3">
            <span className="text-xs text-muted-foreground">Currently held by</span>
            <span className="text-xs font-semibold text-foreground">
              {pkg.currentCustodian ? `${pkg.currentCustodian.name} (${pkg.currentCustodian.role})` : 'No custodian assigned'}
              {pkg.assignedDriver && pkg.currentCustodian?.role !== 'DRIVER' ? ` · Driver: ${pkg.assignedDriver}` : ''}
            </span>
          </div>
        </div>

        {/* Custody Trail */}
        {pkg.custody.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ArrowRight className="size-3.5" /> Chain of Custody Trail ({pkg.custody.length})
            </p>
            <div className="mt-3 flex flex-col gap-2.5">
              {pkg.custody.map((entry) => (
                <div key={entry.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/20 p-2.5 text-xs">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600">
                    <Check className="size-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">{entry.fromEntity} → {entry.toEntity}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{timeAgo(entry.timestamp)} · {entry.notes ?? 'Custody change'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Timeline Log */}
        {pkg.events.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-4 shadow-2xs">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Clock3 className="size-3.5" /> Events Timeline ({pkg.events.length})
            </p>
            <div className="mt-3 flex flex-col gap-2">
              {pkg.events.map((event) => (
                <div key={event.id} className="flex gap-3 text-xs">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-foreground">{event.description ?? event.eventType}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {event.eventType} · {formatTimestamp(event.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {pkg.status === 'PENDING_CONFIRMATION' && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-xs text-orange-800 dark:border-orange-800/40 dark:bg-orange-950/30 dark:text-orange-300">
            <MapPin className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-semibold">Delivery code sent to recipient</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                The package was dispatched for recipient handover. Ask the receiver for the 6-digit confirmation code, or they can confirm it directly in their app.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Photo Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-h-[90vh] max-w-2xl overflow-hidden rounded-2xl bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto} alt="Package preview" className="max-h-[80vh] w-auto object-contain" />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute right-3 top-3 grid size-8 place-items-center rounded-full bg-black/60 text-white hover:bg-black cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // Inline right-pane mode for WhatsApp Desktop layout
  if (inline) {
    return content
  }

  // Standalone drawer mode for popups (e.g. inside CustodyInbox)
  return (
    <>
      <div className="fixed inset-0 z-[70] bg-foreground/20 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />
      <aside className="fixed inset-y-0 right-0 z-[70] flex w-full max-w-xl flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
        {content}
      </aside>
    </>
  )
}
