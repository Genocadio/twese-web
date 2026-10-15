'use client'

import { useState } from 'react'
import { Check, Inbox, KeyRound, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import {
  ACCEPTOR_LABEL,
  RULE_TONE,
  statusClass,
  statusLabel,
  TRANSFER_RULE_LABEL,
  TRANSFER_STATUS_LABEL,
} from '@/lib/status'
import { timeAgo } from '@/lib/format'
import type { DeliveryPackage, PackageItem, Transfer } from '@/lib/types'
import { cn } from '@/lib/utils'
import { toPackageItem } from '@/lib/api'
import { CodePromptDialog, CodeRevealDialog, ConfirmDialog } from './dialogs'
import { PackageDetail } from './package-detail'

type Tab = 'transfers' | 'offers'

/**
 * Minimal placeholder used to open the detail drawer for a package we only
 * know by id (e.g. a package inside an incoming transfer that is not in local
 * state). PackageDetail fetches the full package by id on open and replaces
 * this stub's data.
 */
function stubPackageItem(packageId: string): PackageItem {
  return {
    id: packageId,
    trackingCode: '…',
    deliveryType: 'OPEN',
    status: 'CREATED',
    sender: '',
    receiver: '',
    origin: '',
    destination: '',
    weight: null,
    category: null,
    description: null,
    fragile: false,
    photos: [],
    currentCustodian: null,
    assignedDriver: null,
    isMine: false,
    isCreator: false,
    openTransfer: null,
    events: [],
    custody: [],
    updatedAt: new Date(0).toISOString(),
  }
}

export function CustodyInbox() {
  const { user } = useAuth()
  const workspace = useWorkspace()
  const meId = user?.id ?? ''
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('transfers')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; description?: string; label?: string; run: () => Promise<void> } | null>(null)
  const [codePrompt, setCodePrompt] = useState<{ transfer: Transfer; title: string; description?: string } | null>(null)
  const [viewOffer, setViewOffer] = useState<DeliveryPackage | null>(null)
  const [viewTransferPackages, setViewTransferPackages] = useState<Transfer | null>(null)
  const [viewTransferPackage, setViewTransferPackage] = useState<PackageItem | null>(null)

  // Only show transfers initiated by drivers (acceptorType=WORKER) —
  // worker→driver transfers show in the mobile app, not here.
  // Safety-net: also exclude DONE/CANCELED transfers in case local state is stale
  // (e.g. a driver accepted on mobile before the 60 s sync ran).
  const incoming = workspace.pendingTransfers.filter(
    (transfer) => transfer.creatorId !== meId && transfer.acceptorType === 'WORKER' &&
      transfer.status !== 'DONE' && transfer.status !== 'CANCELED'
  )
  const requestedByMe = workspace.requestedTransfers.filter(
    (transfer) => transfer.requestorId === meId &&
      transfer.status !== 'DONE' && transfer.status !== 'CANCELED'
  )
  // Only show offers that have an active transfer — client packages with no transfer
  // are not transfer offers and should not appear here.
  const transferOffers = workspace.offers.filter((offer) =>
    offer.transfers.some((t) => t.status === 'PENDING' || t.status === 'REQUESTED')
  )
  const offerCount = transferOffers.length
  const badgeCount = incoming.length + requestedByMe.length

  // Look up PackageItem from a transfer's package links — checks my packages
  // first, then the available-offers list.
  function findPackageForTransfer(packageId?: string): PackageItem | undefined {
    if (!packageId) return undefined
    const mine = workspace.packages.find((p) => p.id === packageId)
    if (mine) return mine
    const offer = workspace.offers.find((o) => o.id === packageId)
    return offer ? toPackageItem(offer, meId) : undefined
  }

  // Open the detail drawer for a package by id even when it is not in local
  // state — the drawer fetches full data on open. The FAB stays open; the
  // drawer overlays it and closing it returns to the inbox.
  function openPackageById(packageId?: string) {
    if (!packageId) return
    setViewTransferPackage(findPackageForTransfer(packageId) ?? stubPackageItem(packageId))
  }

  async function acceptAuto(transfer: Transfer) {
    setBusyId(transfer.id)
    try {
      await workspace.acceptTransfer(transfer.id)
    } catch {
      /* toasted */
    } finally {
      setBusyId(null)
    }
  }

  async function acceptSecure(transfer: Transfer, code: string) {
    setBusyId(transfer.id)
    try {
      await workspace.acceptTransfer(transfer.id, code)
      setCodePrompt(null)
    } catch {
      /* toasted */
    } finally {
      setBusyId(null)
    }
  }

  async function requestConfirm(transfer: Transfer) {
    setBusyId(transfer.id)
    try {
      await workspace.acceptTransfer(transfer.id, undefined, { successMessage: 'Transfer requested — waiting for the owner to confirm' })
    } catch {
      /* toasted */
    } finally {
      setBusyId(null)
    }
  }

  async function claim(offerId: string) {
    setBusyId(offerId)
    try {
      await workspace.claimPackage(offerId)
    } catch {
      /* toasted */
    } finally {
      setBusyId(null)
    }
  }

  async function confirmRun() {
    if (!confirm) return
    setBusyId('confirm')
    try {
      await confirm.run()
      setConfirm(null)
    } catch {
      /* toasted */
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      <div className="fixed bottom-6 right-5 z-[60] sm:bottom-8 sm:right-8">
        <button
          onClick={() => setOpen((value) => !value)}
          aria-label={`Open custody inbox${badgeCount ? `, ${badgeCount} available` : ''}`}
          className="relative grid size-14 place-items-center rounded-full bg-[#1f2523] text-white shadow-xl transition-transform hover:scale-105"
        >
          <Inbox className="size-5" />
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-[#ef8d54] text-[10px] font-bold text-white">
              {badgeCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute bottom-16 right-0 w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-3 shadow-2xl">
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              <button
                onClick={() => setTab('transfers')}
                className={cn('flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold', tab === 'transfers' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                Transfers <span className="ml-1">{incoming.length + requestedByMe.length}</span>
              </button>
              <button
                onClick={() => setTab('offers')}
                className={cn('flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold', tab === 'offers' ? 'bg-card shadow-sm' : 'text-muted-foreground')}
              >
                New offers <span className="ml-1">{offerCount}</span>
              </button>
            </div>

            <div className="max-h-[26rem] overflow-y-auto pt-3">
              {tab === 'transfers' && (
                <div className="flex flex-col gap-2">
                  {incoming.length === 0 && requestedByMe.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">No open transfers for your role right now.</p>
                  ) : (
                    <>
                      {requestedByMe.map((transfer) => (
                        <TransferRow key={transfer.id} transfer={transfer} note="You requested this transfer — waiting for the owner to confirm." />
                      ))}
                      {incoming.map((transfer) => (
                        <div key={transfer.id} className="rounded-xl border border-border p-3">
                          <TransferHeader transfer={transfer} />
                          <div className="mt-3 flex gap-2">
                            {transfer.packages.length === 1 ? (
                              <Button variant="outline" size="sm" className="flex-1" onClick={() => openPackageById(transfer.packages[0]?.packageId)}>
                                View details
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewTransferPackages(transfer)}>
                                View packages
                              </Button>
                            )}
                            {transfer.ruleType === 'AUTO' && (
                              <Button size="sm" className="flex-1 gap-1.5 bg-[#1f2523] text-white hover:bg-[#343b37]" disabled={busyId === transfer.id} onClick={() => void acceptAuto(transfer)}>
                                {busyId === transfer.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                Accept
                              </Button>
                            )}
                            {transfer.ruleType === 'SECURE' && (
                              <Button
                                size="sm"
                                className="flex-1 gap-1.5 bg-[#1f2523] text-white hover:bg-[#343b37]"
                                onClick={() => setCodePrompt({ transfer, title: `Accept ${transfer.ruleType} transfer`, description: `This transfer is code protected. Ask the sender for the 8-character code.` })}
                              >
                                <KeyRound className="size-3.5" /> Enter code
                              </Button>
                            )}
                            {transfer.ruleType === 'CONFIRM' && (
                              <Button size="sm" variant="outline" className="flex-1 gap-1.5" disabled={busyId === transfer.id} onClick={() => void requestConfirm(transfer)}>
                                {busyId === transfer.id && <Loader2 className="size-3.5 animate-spin" />}
                                Request
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {tab === 'offers' && (
                <div className="flex flex-col gap-2">
                  {transferOffers.length === 0 ? (
                    <p className="px-2 py-6 text-center text-xs text-muted-foreground">No transfer offers right now.</p>
                  ) : (
                    transferOffers.map((offer) => {
                      const receiver = offer.people.find((person) => person.role === 'RECEIVER')
                      const destination = offer.locations.find((location) => location.type === 'DESTINATION')
                      const activeTransfer = offer.transfers.find((t) => t.status === 'PENDING' || t.status === 'REQUESTED')
                      return (
                        <div key={offer.id} className="rounded-xl border border-border p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-xs font-semibold">{offer.trackingCode}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {receiver?.name ?? 'Receiver'} · {destination?.placeName ?? 'Destination'}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn('text-[10px]', statusClass(offer.status))}>{statusLabel(offer.status)}</Badge>
                          </div>
                          <p className="mt-2 text-[10px] text-muted-foreground">
                            Created {timeAgo(offer.createdAt)} · {offer.deliveryType}
                          </p>
                          {activeTransfer && (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Transfer: {TRANSFER_RULE_LABEL[activeTransfer.ruleType] ?? activeTransfer.ruleType} · {TRANSFER_STATUS_LABEL[activeTransfer.status] ?? activeTransfer.status}
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => setViewOffer(offer)}>
                              View details
                            </Button>
                            {activeTransfer && activeTransfer.status === 'PENDING' && activeTransfer.ruleType === 'AUTO' && (
                              <Button
                                size="sm"
                                className="flex-1 bg-[#f07c42] text-white hover:bg-[#e3743e]"
                                disabled={busyId === offer.id}
                                onClick={() => void claim(offer.id)}
                              >
                                {busyId === offer.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                Accept
                              </Button>
                            )}
                            {activeTransfer && activeTransfer.status === 'PENDING' && activeTransfer.ruleType === 'SECURE' && (
                              <Button
                                size="sm"
                                className="flex-1 bg-[#f07c42] text-white hover:bg-[#e3743e]"
                                onClick={() => setCodePrompt({ transfer: activeTransfer, title: 'Accept code-protected transfer', description: 'This transfer is code protected. Ask the sender for the 8-character code.' })}
                              >
                                <KeyRound className="size-3.5" /> Enter code
                              </Button>
                            )}
                            {activeTransfer && activeTransfer.status === 'PENDING' && activeTransfer.ruleType === 'CONFIRM' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 gap-1.5"
                                disabled={busyId === activeTransfer.id}
                                onClick={() => void requestConfirm(activeTransfer)}
                              >
                                {busyId === activeTransfer.id && <Loader2 className="size-3.5 animate-spin" />}
                                Request
                              </Button>
                            )}
                            {activeTransfer && activeTransfer.status === 'REQUESTED' && (
                              <Badge variant="outline" className="flex-1 items-center justify-center border-violet-200 bg-violet-50 text-[10px] text-violet-700">
                                Requested
                              </Badge>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? ''}
        description={confirm?.description}
        confirmLabel={confirm?.label}
        busy={busyId === 'confirm'}
        onConfirm={() => void confirmRun()}
        onClose={() => setConfirm(null)}
      />
      <CodePromptDialog
        key={codePrompt ? `code-${codePrompt.transfer.id}` : 'none'}
        open={Boolean(codePrompt)}
        title={codePrompt?.title ?? ''}
        description={codePrompt?.description}
        placeholder="XXXXXXXX"
        busy={busyId === codePrompt?.transfer.id}
        onConfirm={(code) => {
          if (codePrompt) void acceptSecure(codePrompt.transfer, code)
        }}
        onClose={() => setCodePrompt(null)}
      />
      <PackageDetail item={viewOffer ? toPackageItem(viewOffer, meId) : null} onClose={() => setViewOffer(null)} />
      <PackageDetail item={viewTransferPackage} onClose={() => setViewTransferPackage(null)} />

      {/* Transfer packages list drawer */}
      {viewTransferPackages && (
        <>
          <div className="fixed inset-0 z-[70] bg-foreground/20" onClick={() => setViewTransferPackages(null)} aria-hidden="true" />
          <aside className="fixed inset-y-0 left-0 z-[70] flex w-full max-w-md flex-col border-r border-border bg-card shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-border p-5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Transfer packages</p>
                <h2 className="mt-1 text-lg font-semibold">{viewTransferPackages.packages.length} package{viewTransferPackages.packages.length !== 1 ? 's' : ''}</h2>
                <Badge variant="outline" className={cn('mt-1 text-[10px]', RULE_TONE[viewTransferPackages.ruleType])}>
                  {TRANSFER_RULE_LABEL[viewTransferPackages.ruleType]}
                </Badge>
              </div>
              <button onClick={() => setViewTransferPackages(null)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex flex-col gap-2">
                {viewTransferPackages.packages.map((link) => {
                  const pkg = findPackageForTransfer(link.packageId)
                  return (
                    <div key={link.id} className="rounded-xl border border-border p-3">
                      {pkg ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-mono text-xs font-semibold">{pkg.trackingCode}</p>
                            <Badge variant="outline" className={cn('text-[10px]', statusClass(pkg.status))}>
                              {statusLabel(pkg.status)}
                            </Badge>
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {pkg.receiver} · {pkg.origin} → {pkg.destination}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 w-full"
                            onClick={() => { setViewTransferPackage(pkg); setViewTransferPackages(null) }}
                          >
                            View details
                          </Button>
                        </>
                      ) : (
                        <p className="font-mono text-[10px] text-muted-foreground">{link.packageId}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  )
}

function TransferRow({ transfer, note }: { transfer: Transfer; note?: string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <TransferHeader transfer={transfer} />
      {note && <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  )
}

function TransferHeader({ transfer }: { transfer: Transfer }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="flex flex-wrap items-center gap-2 font-mono text-xs font-semibold">
          Transfer · {transfer.packages.length} package{transfer.packages.length === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {ACCEPTOR_LABEL[transfer.acceptorType] ?? transfer.acceptorType} · created {timeAgo(transfer.createdAt)}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge variant="outline" className={cn('text-[9px]', RULE_TONE[transfer.ruleType])}>{TRANSFER_RULE_LABEL[transfer.ruleType]}</Badge>
        <Badge variant="outline" className="font-mono text-[9px] text-muted-foreground">{TRANSFER_STATUS_LABEL[transfer.status]}</Badge>
      </div>
    </div>
  )
}
