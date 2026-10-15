'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, PackageCheck, Plus, Search, Send, Truck, KeyRound, X, XCircle } from 'lucide-react'
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
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

  // Quick actions rendered inline on list rows (the same flows live in the
  // detail drawer).
  const [deliverItem, setDeliverItem] = useState<PackageItem | null>(null)
  const [confirmItem, setConfirmItem] = useState<PackageItem | null>(null)
  const [transferItemId, setTransferItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Packages that arrived at this office (as their destination) are handed to
  // the receiver from here — one-tap "Deliver".
  const officeDeliver = (item: PackageItem) =>
    ['DESTINATION_OFFICE', 'READY_FOR_COLLECTION'].includes(item.status)
  const awaitingConfirm = (item: PackageItem) => item.status === 'PENDING_CONFIRMATION'
  // Packages I hold or held by this office (origin = this office) go out via a
  // driver — regardless of destination. Offer the handover until one is open.
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

  // Discrete pagination over the server-side package pages.
  const page = workspace.packagesPage
  const totalPages = workspace.packagesTotalPages
  const totalCount = workspace.packagesTotalCount
  const pageLoading = workspace.pageLoading
  // Page numbers with ellipses when there are too many to render inline.
  const pageNumbers = useMemo(() => {
    const total = Math.max(totalPages, 1)
    const current = Math.min(page + 1, total)
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const list: (number | '…')[] = [1]
    if (current > 3) list.push('…')
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) list.push(i)
    if (current < total - 2) list.push('…')
    list.push(total)
    return list
  }, [page, totalPages])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <CustodyInbox />

      {/* Toolbar — search toggle, filter dropdown, and create action on one line */}
      <div className="flex shrink-0 items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((value) => !value)}
          title={searchOpen ? 'Hide search' : 'Search packages'}
          className={cn('h-9 shrink-0 gap-2 text-xs', searchOpen && 'bg-muted text-foreground')}
        >
          <Search className="size-3.5" />
          <span className="max-w-40 truncate">{query.trim() ? `"${query}"` : 'Search'}</span>
        </Button>

        <div className="relative shrink-0">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterKey)}
            aria-label="Filter packages"
            className="h-9 cursor-pointer appearance-none rounded-lg border border-border bg-muted pl-3 pr-8 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {FILTER_TABS.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label} ({counts[tab.key]})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {searchOpen ? (
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  setQuery('')
                  setSearchOpen(false)
                }
              }}
              autoFocus
              placeholder="Track code, recipient, destination, custodian…"
              className="h-9 pl-9 pr-8 text-xs"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="min-w-0 flex-1" />
        )}

        <Button size="sm" className="h-9 shrink-0 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]" onClick={() => setCreateOpen(true)}>
          <Plus className="size-3.5" /> New package
        </Button>
      </div>

      {/* Package list — the only scrollable region on the page */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card">
        {workspace.packagesLoading && workspace.packages.length === 0 ? (
          <div className="grid min-h-0 flex-1 place-items-center px-4 text-muted-foreground">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-6 animate-spin" />
              <p className="text-xs">Loading packages…</p>
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid min-h-0 flex-1 place-items-center px-4 text-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {query.trim() ? `No packages match "${query}".` : 'No packages here.'}
              </p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground/80">
                {query.trim()
                  ? 'Try a different tracking code, recipient, or destination.'
                  : 'Create a package or accept a transfer to see packages here.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            {filtered.map((item) => (
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
              className="group flex w-full cursor-pointer items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 sm:items-center sm:gap-4 sm:px-5"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <PackageCheck className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs font-semibold">{item.trackingCode}</p>
                  <Badge variant="outline" className={cn('text-[10px]', statusClass(item.status))}>
                    {statusLabel(item.status)}
                  </Badge>
                  {item.openTransfer && (item.isMine || item.currentCustodian?.role === 'OFFICE' || item.currentCustodian?.role === 'WORKER') && (
                    <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[9px] text-violet-700">
                      Awaiting driver
                    </Badge>
                  )}
                  {item.fragile && (
                    <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[9px] text-amber-700">
                      Fragile
                    </Badge>
                  )}
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {item.receiver} · {item.origin} → {item.destination}
                </p>
                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                  {item.currentCustodian ? `${item.currentCustodian.name} (${item.currentCustodian.role})` : 'No custodian'}
                  {item.assignedDriver && item.currentCustodian?.role !== 'DRIVER' ? ` · Driver: ${item.assignedDriver}` : ''}
                  {item.openTransfer && (item.isMine || item.currentCustodian?.role === 'OFFICE' || item.currentCustodian?.role === 'WORKER') ? ` · ${TRANSFER_RULE_LABEL[item.openTransfer.ruleType] ?? ''} transfer open — waiting for the driver to accept` : ''}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {canTransfer(item) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setTransferItemId(item.id)
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted"
                    >
                      <Truck className="size-3" /> Transfer to driver
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
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                    >
                      <XCircle className="size-3" /> Recall transfer offer
                    </button>
                  )}
                  {officeDeliver(item) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setDeliverItem(item)
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[#f07c42] px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-[#e3743e]"
                    >
                      <Send className="size-3" /> Deliver
                    </button>
                  )}
                  {awaitingConfirm(item) && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setConfirmItem(item)
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[#1f2523] px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-[#343b37]"
                    >
                      <KeyRound className="size-3" /> Enter delivery code
                    </button>
                  )}
                </div>
              </div>
              <div className="hidden shrink-0 text-right sm:block">
                <p className="font-mono text-[10px] text-muted-foreground">{timeAgo(item.updatedAt)}</p>
                {item.weight && <p className="mt-1 text-[10px] text-muted-foreground">{item.weight}</p>}
              </div>
            </div>
          ))}
          </div>
        )}
      </div>

      {/* Pager */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
        <p className="min-w-0 truncate text-[11px] text-muted-foreground">
          {totalCount > 0 ? `${filtered.length} of ${totalCount} package${totalCount === 1 ? '' : 's'}` : 'No packages'}
          {totalPages > 1 && (
            <>
              {' '}· Page <span className="font-semibold text-foreground">{page + 1}</span> of {totalPages}
            </>
          )}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={pageLoading || page === 0}
              onClick={() => void workspace.goToPage(page - 1)}
            >
              <ChevronLeft className="size-3.5" /> Prev
            </Button>
            <div className="flex items-center gap-1">
              {pageNumbers.map((entry, index) =>
                entry === '…' ? (
                  <span key={`gap-${index}`} className="px-1 text-xs text-muted-foreground">…</span>
                ) : (
                  <Button
                    key={entry}
                    size="sm"
                    variant={entry === page + 1 ? 'default' : 'outline'}
                    disabled={pageLoading}
                    onClick={() => void workspace.goToPage(entry - 1)}
                    className={cn('min-w-7 px-1 text-xs', entry === page + 1 && 'bg-[#1f2523] text-white hover:bg-[#343b37]')}
                  >
                    {entry}
                  </Button>
                ),
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={pageLoading || page >= totalPages - 1}
              onClick={() => void workspace.goToPage(page + 1)}
            >
              Next <ChevronRight className="size-3.5" />
            </Button>
            {pageLoading && <Loader2 className="ml-1 size-3.5 animate-spin text-muted-foreground" />}
          </div>
        )}
      </div>

      <PackageDetail item={selected} onClose={() => setSelectedId(null)} />
      <CreatePackageDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* Quick-row actions — the same flows as the detail drawer */}
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
