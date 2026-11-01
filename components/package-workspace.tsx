'use client'

import { useMemo, useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  KeyRound,
  Loader2,
  Package,
  PackageCheck,
  Plus,
  Search,
  Send,
  Sparkles,
  Truck,
  X,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import { statusClass, statusLabel, TRANSFER_RULE_LABEL } from '@/lib/status'
import { timeAgo } from '@/lib/format'
import type { PackageItem } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CustodyInbox } from '@/components/workspace/inbox'
import { PackageDetail } from '@/components/workspace/package-detail'
import { CreatePackageDialog } from '@/components/workspace/create-package-dialog'
import { CodePromptDialog, ConfirmDialog } from '@/components/workspace/dialogs'
import { DriverPickerDialog } from '@/components/workspace/driver-picker-dialog'

type FilterKey = 'all' | 'at-office' | 'in-transit' | 'delivered' | 'other'

interface FilterTab {
  key: FilterKey
  label: string
  match: (item: PackageItem) => boolean
}

const FILTER_TABS: FilterTab[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'at-office',
    label: 'At office',
    match: (item) => ['CREATED', 'ORIGIN_OFFICE', 'ACCEPTED'].includes(item.status),
  },
  {
    key: 'in-transit',
    label: 'In transit',
    match: (item) =>
      ['ASSIGNED_DRIVER', 'PICKED_UP', 'IN_TRANSIT', 'DESTINATION_OFFICE', 'READY_FOR_COLLECTION'].includes(
        item.status,
      ),
  },
  {
    key: 'delivered',
    label: 'Delivered',
    match: (item) => ['PENDING_CONFIRMATION', 'DELIVERED', 'COMPLETED'].includes(item.status),
  },
  {
    key: 'other',
    label: 'Other',
    match: (item) => item.status === 'CANCELLED',
  },
]

export function PackageWorkspace() {
  const { user } = useAuth()
  const workspace = useWorkspace()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [inboxOpen, setInboxOpen] = useState(false)
  const meId = user?.id ?? ''

  const filtered = useMemo(() => {
    const tab = FILTER_TABS.find((t) => t.key === filter) ?? FILTER_TABS[0]
    let items = workspace.packages.filter(tab.match)
    const q = query.trim().toLowerCase()
    if (q) {
      items = items.filter((item) =>
        `${item.trackingCode} ${item.receiver} ${item.destination} ${item.sender} ${item.currentCustodian?.name ?? ''}`
          .toLowerCase()
          .includes(q),
      )
    }
    return items
  }, [workspace.packages, query, filter])

  const selected = workspace.packages.find((item) => item.id === selectedId) ?? null

  // Quick actions rendered inline on list rows or detail header
  const [deliverItem, setDeliverItem] = useState<PackageItem | null>(null)
  const [confirmItem, setConfirmItem] = useState<PackageItem | null>(null)
  const [transferItemId, setTransferItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const officeDeliver = (item: PackageItem) =>
    ['DESTINATION_OFFICE', 'READY_FOR_COLLECTION'].includes(item.status)
  const awaitingConfirm = (item: PackageItem) => item.status === 'PENDING_CONFIRMATION'
  const canTransfer = (item: PackageItem) =>
    (item.isMine || item.currentCustodian?.role === 'OFFICE' || item.currentCustodian?.role === 'WORKER') &&
    ['CREATED', 'ORIGIN_OFFICE', 'ACCEPTED'].includes(item.status) &&
    !item.openTransfer

  async function runQuickDeliver() {
    if (!deliverItem) return
    setBusy(true)
    try {
      await workspace.initiateDelivery(deliverItem.id)
      setDeliverItem(null)
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  async function runQuickConfirm(code: string) {
    if (!confirmItem) return
    setBusy(true)
    try {
      await workspace.confirmDelivery(confirmItem.id, code)
      setConfirmItem(null)
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  async function runQuickTransfer(driverId: string) {
    if (!transferItemId) return
    await workspace.createTransferForPackages([transferItemId], 'AUTO', driverId)
  }

  // Compute badge counts for each tab
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: 0, 'at-office': 0, 'in-transit': 0, delivered: 0, other: 0 }
    for (const item of workspace.packages) {
      for (const tab of FILTER_TABS) {
        if (tab.match(item)) {
          c[tab.key]++
        }
      }
    }
    return c
  }, [workspace.packages])

  // Inbox badge calculation
  const incomingTransfersCount = useMemo(() => {
    return (
      workspace.pendingTransfers.filter(
        (t) => t.creatorId !== meId && t.acceptorType === 'WORKER' && t.status !== 'DONE' && t.status !== 'CANCELED'
      ).length +
      workspace.requestedTransfers.filter(
        (t) => t.requestorId === meId && t.status !== 'DONE' && t.status !== 'CANCELED'
      ).length
    )
  }, [workspace.pendingTransfers, workspace.requestedTransfers, meId])

  const offersCount = useMemo(() => {
    return workspace.offers.filter((o) =>
      o.transfers.some((t) => t.status === 'PENDING' || t.status === 'REQUESTED')
    ).length
  }, [workspace.offers])

  const totalInboxBadge = incomingTransfersCount + offersCount

  // Discrete pagination over the server-side package pages
  const page = workspace.packagesPage
  const totalPages = workspace.packagesTotalPages
  const totalCount = workspace.packagesTotalCount
  const pageLoading = workspace.pageLoading

  return (
    <div className="flex h-full w-full min-h-0 flex-1 overflow-hidden bg-background">
      {/* ── LEFT PANE (Master List & Search) ─────────────────────────────────── */}
      <section
        className={cn(
          'flex h-full flex-col border-r border-border bg-card/60 backdrop-blur-xs transition-all duration-200 overflow-hidden',
          selectedId
            ? 'hidden md:flex md:w-[380px] lg:w-[420px] xl:w-[450px] shrink-0'
            : 'flex w-full md:w-[380px] lg:w-[420px] xl:w-[450px] shrink-0'
        )}
      >
        {/* Top Control Toolbar — Search, New Package, and Inbox on SAME line */}
        <div className="shrink-0 border-b border-border bg-card/90 p-3 space-y-2.5">
          <div className="flex items-center gap-2">
            {/* Search Input */}
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search packages, recipient, code…"
                className="h-9 w-full rounded-xl bg-background pl-8.5 pr-8 text-xs placeholder:text-muted-foreground/75 focus-visible:ring-1 focus-visible:ring-primary"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery('')}
                  className="absolute right-2.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {/* New Package Action Button on SAME line */}
            <Button
              size="sm"
              onClick={() => setCreateOpen(true)}
              className="h-9 shrink-0 gap-1.5 rounded-xl bg-[#1f2523] px-3 text-xs font-semibold text-white shadow-xs hover:bg-[#343b37] interactive-btn"
              title="Create new package"
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>

            {/* Inbox / Transfers Toggle Button on SAME line */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInboxOpen(true)}
              className="relative h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-xs font-medium interactive-btn"
              title="Open Custody Transfers & Offers"
            >
              <Inbox className="size-3.5" />
              {totalInboxBadge > 0 && (
                <span className="absolute -right-1 -top-1 grid size-4.5 place-items-center rounded-full bg-[#ef8d54] text-[9px] font-bold text-white shadow-xs">
                  {totalInboxBadge > 9 ? '9+' : totalInboxBadge}
                </span>
              )}
            </Button>
          </div>

          {/* Status Filter Pills Row */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer',
                    active
                      ? 'bg-[#1f2523] text-white shadow-xs dark:bg-primary dark:text-primary-foreground'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground interactive-tap'
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      'rounded-md px-1 py-0.2 font-mono text-[9px] font-semibold',
                      active ? 'bg-white/20 text-white' : 'bg-background/80 text-muted-foreground'
                    )}
                  >
                    {counts[tab.key]}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Package List (Scrollable) */}
        <div className="min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto">
          {workspace.packagesLoading && workspace.packages.length === 0 ? (
            <div className="grid h-48 place-items-center px-4 text-muted-foreground">
              <div className="flex flex-col items-center gap-2.5">
                <Loader2 className="size-5 animate-spin text-primary" />
                <p className="text-xs">Loading packages…</p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid h-64 place-items-center px-6 text-center">
              <div className="space-y-1.5">
                <div className="mx-auto grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                  <Package className="size-5" />
                </div>
                <p className="text-xs font-semibold text-foreground">
                  {query.trim() ? `No packages matching "${query}"` : 'No packages in this filter'}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {query.trim()
                    ? 'Check tracking code or recipient name and try again.'
                    : 'Create a new package or accept an incoming transfer.'}
                </p>
              </div>
            </div>
          ) : (
            filtered.map((item) => {
              const isSelected = item.id === selectedId
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedId(item.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedId(item.id)
                    }
                  }}
                  className={cn(
                    'group relative flex w-full flex-col gap-1.5 p-3.5 text-left transition-all duration-150 cursor-pointer',
                    isSelected
                      ? 'bg-primary/5 dark:bg-primary/10 border-l-[3.5px] border-l-[#1f2523] dark:border-l-primary shadow-2xs'
                      : 'border-l-[3.5px] border-l-transparent hover:bg-muted/50 interactive-card'
                  )}
                >
                  {/* Top Line: Tracking code, status badge, time */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <PackageCheck className={cn('size-3.5 shrink-0', isSelected ? 'text-primary' : 'text-muted-foreground')} />
                      <span className="font-mono text-xs font-bold tracking-tight text-foreground">
                        {item.trackingCode}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="outline" className={cn('text-[9px] font-semibold', statusClass(item.status))}>
                        {statusLabel(item.status)}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">{timeAgo(item.updatedAt)}</span>
                    </div>
                  </div>

                  {/* Route line */}
                  <p className="truncate text-xs text-foreground/90 font-medium">
                    {item.receiver} <span className="text-muted-foreground font-normal">· {item.origin} → {item.destination}</span>
                  </p>

                  {/* Custody info + tags */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span className="truncate">
                      {item.currentCustodian ? `${item.currentCustodian.name} (${item.currentCustodian.role})` : 'No custodian'}
                    </span>
                    {item.fragile && (
                      <span className="rounded bg-amber-50 px-1 py-0.2 text-[9px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        Fragile
                      </span>
                    )}
                    {item.openTransfer && (
                      <span className="rounded bg-violet-50 px-1 py-0.2 text-[9px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        Transfer pending
                      </span>
                    )}
                  </div>

                  {/* Inline quick-actions for high-frequency actions */}
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {officeDeliver(item) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeliverItem(item)
                        }}
                        className="flex items-center gap-1 rounded-md bg-[#f07c42] px-2 py-0.5 text-[10px] font-semibold text-white transition-all hover:bg-[#e3743e] interactive-btn"
                      >
                        <Send className="size-2.5" /> Deliver
                      </button>
                    )}

                    {awaitingConfirm(item) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setConfirmItem(item)
                        }}
                        className="flex items-center gap-1 rounded-md bg-[#1f2523] px-2 py-0.5 text-[10px] font-semibold text-white transition-all hover:bg-[#343b37] interactive-btn"
                      >
                        <KeyRound className="size-2.5" /> Enter code
                      </button>
                    )}

                    {canTransfer(item) && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setTransferItemId(item.id)
                        }}
                        className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-all hover:bg-muted hover:text-foreground interactive-btn"
                      >
                        <Truck className="size-2.5" /> Transfer
                      </button>
                    )}

                    {item.openTransfer && (item.openTransfer.creatorId === meId || item.isMine) && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async (event) => {
                          event.stopPropagation()
                          if (item.openTransfer) {
                            setBusy(true)
                            try {
                              await workspace.cancelTransfer(item.openTransfer.id)
                            } finally {
                              setBusy(false)
                            }
                          }
                        }}
                        className="flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 transition-all hover:bg-red-100 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-400 interactive-btn"
                      >
                        <XCircle className="size-2.5" /> Recall
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Compact List Footer (Pagination) */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-card/90 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="truncate">
            {totalCount > 0 ? `${filtered.length} of ${totalCount}` : '0 packages'}
          </span>

          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="xs"
                variant="outline"
                disabled={pageLoading || page === 0}
                onClick={() => void workspace.goToPage(page - 1)}
                className="size-6 p-0 interactive-btn"
                title="Previous page"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="px-1 font-mono text-[10px] text-foreground font-semibold">
                {page + 1}/{totalPages}
              </span>
              <Button
                size="xs"
                variant="outline"
                disabled={pageLoading || page >= totalPages - 1}
                onClick={() => void workspace.goToPage(page + 1)}
                className="size-6 p-0 interactive-btn"
                title="Next page"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ── RIGHT PANE (Detail View / WhatsApp Desktop Style) ────────────────── */}
      <main
        className={cn(
          'flex h-full min-w-0 flex-1 flex-col bg-background/50 overflow-hidden',
          !selectedId ? 'hidden md:flex' : 'flex'
        )}
      >
        {selected ? (
          <PackageDetail
            item={selected}
            onClose={() => setSelectedId(null)}
            inline={true}
            onDeliver={setDeliverItem}
            onConfirmDelivery={setConfirmItem}
            onTransferToDriver={setTransferItemId}
          />
        ) : (
          /* WhatsApp Desktop Empty State */
          <div className="flex h-full flex-col items-center justify-center p-8 text-center select-none">
            <div className="relative">
              <div className="grid size-20 place-items-center rounded-3xl border border-border/80 bg-card/80 shadow-sm">
                <Package className="size-9 text-muted-foreground/80" />
              </div>
              <div className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-emerald-500 text-white shadow-xs">
                <Sparkles className="size-3.5" />
              </div>
            </div>

            <h2 className="mt-5 text-base font-semibold text-foreground">Twese Worker Workspace</h2>
            <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
              Select a package from the list to view route details, transfer history, and manage handovers
              while keeping the list active.
            </p>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
              <Button
                size="sm"
                onClick={() => setCreateOpen(true)}
                className="gap-1.5 rounded-xl bg-[#1f2523] px-3.5 text-xs font-semibold text-white shadow-xs hover:bg-[#343b37] interactive-btn"
              >
                <Plus className="size-3.5" /> New package
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setInboxOpen(true)}
                className="gap-1.5 rounded-xl px-3.5 text-xs font-medium interactive-btn"
              >
                <Inbox className="size-3.5" /> Open transfers inbox
              </Button>
            </div>

            <div className="mt-8 flex items-center gap-2 text-[11px] text-muted-foreground/75">
              <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Real-time delivery synchronization active</span>
            </div>
          </div>
        )}
      </main>

      {/* Custody Transfers Drawer */}
      <CustodyInbox open={inboxOpen} onClose={() => setInboxOpen(false)} />

      {/* Create Package Dialog */}
      <CreatePackageDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Quick-row actions dialogs */}
      <ConfirmDialog
        open={Boolean(deliverItem)}
        title={`Deliver ${deliverItem?.trackingCode ?? ''}?`}
        description="Initiates delivery to the receiver and generates a one-time 6-digit confirmation code. The package moves to “awaiting confirmation”."
        confirmLabel="Deliver"
        busy={busy}
        onConfirm={() => void runQuickDeliver()}
        onClose={() => setDeliverItem(null)}
      />
      <CodePromptDialog
        key={confirmItem ? `confirm-${confirmItem.id}` : 'none'}
        open={Boolean(confirmItem)}
        title={`Enter delivery code for ${confirmItem?.trackingCode ?? ''}`}
        description="The receiver was sent the delivery code in their app — they should share it with you, or confirm delivery themselves."
        placeholder="000000"
        confirmLabel="Confirm delivery"
        busy={busy}
        onConfirm={(code) => void runQuickConfirm(code)}
        onClose={() => setConfirmItem(null)}
      />
      <DriverPickerDialog
        open={Boolean(transferItemId)}
        title="Transfer to a driver"
        description="A transfer will be created for the selected driver to pick up the package."
        onConfirm={(driverId) => runQuickTransfer(driverId)}
        onClose={() => setTransferItemId(null)}
      />
    </div>
  )
}
