'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { isAuthError } from './client'
import * as api from './api'
import { subscribeGraphql } from './realtime'
import { useAuth } from './auth'
import type { CompanyOffice, DeliveryPackage, Notice, PackageItem, PackageStatus, Transfer, TransferRuleType, User } from './types'
import { toPackageItem } from './api'
import {
  DEMO_DRIVERS,
  DEMO_NOTICES,
  DEMO_OFFERS,
  DEMO_OFFICE,
  DEMO_PACKAGES,
  DEMO_TRANSFERS,
  DEMO_USER,
} from './demo-data'

const SECURE_KEY = 'twese.secureTransferCodes'
// Page size for the workspace package list — server-side pagination fetches
// one page at a time; navigating pages replaces the visible list.
const PACKAGES_PAGE_SIZE = 25
// sessionStorage cache of loaded package pages — a reload paints the previously
// loaded list (and restores scroll) instantly instead of waiting for the
// network. Per-tab and cleared on sign-out, so it never leaks across users.
const PACKAGES_CACHE_KEY = 'twese.workspacePackages'
const PACKAGES_CACHE_TTL_MS = 15 * 60_000
// Slow safety-net sync for the operational board. New packages/offers/transfers
// arrive via the GraphQL subscription; notices arrive via the noticeCreated
// GraphQL subscription. This timer only covers changes neither subscription
// fires for (e.g. another worker accepting a transfer you are watching).
const SYNC_INTERVAL_MS = 60_000

interface WorkspaceState {
  /** Packages list is loading (drives the primary board spinner). */
  packagesLoading: boolean
  /** Offers/transfers/drivers/office are loading (secondary board data). */
  operationalLoading: boolean
  /** Notice feed is loading. */
  noticesLoading: boolean
  refreshing: boolean
  /** A single package page fetch (pager navigation) is in flight. */
  pageLoading: boolean
  error: string | null
  lastSync: number | null
  packages: PackageItem[]
  packagesPage: number
  packagesTotalPages: number
  packagesTotalCount: number
  hasMorePackages: boolean
  offers: DeliveryPackage[]
  pendingTransfers: Transfer[]
  requestedTransfers: Transfer[]
  myTransfers: Transfer[]
  notices: Notice[]
  unread: number
  drivers: User[]
  secureCodes: Record<string, string>
  /** The worker's currently assigned working office (drives the locked package origin). */
  office: CompanyOffice | null
}

interface WorkspaceActions {
  refresh: () => Promise<void>
  goToPage: (page: number) => Promise<void>
  acceptTransfer: (transferId: string, code?: string, opts?: { successMessage?: string }) => Promise<void>
  claimPackage: (packageId: string) => Promise<void>
  createPackage: (input: api.CreatePackageInput) => Promise<{
    packageId: string
    transferId: string | null
    secureCode: string | null
  }>
  assignDriver: (packageId: string, driverId: string) => Promise<void>
  advanceStatus: (packageId: string, status: PackageStatus, opts?: { notes?: string }) => Promise<void>
  initiateDelivery: (packageId: string) => Promise<void>
  confirmDelivery: (packageId: string, deliveryCode: string) => Promise<void>
  regenerateDeliveryCode: (packageId: string) => Promise<void>
  createTransferForPackages: (packageIds: string[], ruleType: TransferRuleType, matchUserId?: string | null) => Promise<Transfer>
  cancelTransfer: (transferId: string) => Promise<void>
  confirmTransfer: (transferId: string) => Promise<void>
  rejectTransfer: (transferId: string) => Promise<void>
  regenerateTransferCode: (transferId: string) => Promise<string>
  markRead: (viewerId: string) => Promise<void>
  markAllRead: () => Promise<void>
  saveSecureCode: (transferId: string, code: string) => void
  getSecureCode: (transferId: string) => string | undefined
}

type WorkspaceContextValue = WorkspaceState & WorkspaceActions

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function readRecord(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function writeRecord(key: string, record: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(record))
  } catch {
    /* ignore */
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { token, status, user, handleSessionExpired } = useAuth()
  const meId = user?.id ?? ''

  const [state, setState] = useState<WorkspaceState>({
    packagesLoading: false,
    operationalLoading: false,
    noticesLoading: false,
    refreshing: false,
    pageLoading: false,
    error: null,
    lastSync: null,
    packages: [],
    packagesPage: 0,
    packagesTotalPages: 0,
    packagesTotalCount: 0,
    hasMorePackages: false,
    offers: [],
    pendingTransfers: [],
    requestedTransfers: [],
    myTransfers: [],
    notices: [],
    unread: 0,
    drivers: [],
    secureCodes: readRecord(SECURE_KEY),
    office: null,
  })
  const mounted = useRef(true)
  // Pagination cursors for the workspace package list (mirrored in state for
  // the UI, kept in refs so fetch callbacks never read stale closures).
  const packagesPageRef = useRef(0)
  const packagesTotalPagesRef = useRef(1)
  const pageLoadingRef = useRef(false)
  const packagesCacheHydratedRef = useRef(false)
  // Latest state for effects that must not depend on every state change.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const patch = useCallback(
    (update: Partial<WorkspaceState> | ((prev: WorkspaceState) => Partial<WorkspaceState>)) => {
      if (mounted.current) {
        setState((prev) => ({ ...prev, ...(typeof update === 'function' ? update(prev) : update) }))
      }
    },
    [],
  )

  const fail = useCallback(
    (error: unknown, notify: boolean): boolean => {
      if (isAuthError(error)) {
        handleSessionExpired()
        return false
      }
      if (notify) {
        patch({ error: error instanceof Error ? error.message : 'Failed to load workspace data' })
      }
      return false
    },
    [handleSessionExpired, patch],
  )

  // Packages — the PRIMARY board content. Server-side pagination: fetches the
  // currently open page (page = packagesPageRef) and replaces the list, so
  // periodic syncs and post-mutation refreshes land on the page the user is
  // reading and the board never accumulates more than one page. It runs
  // independently of the slower operational/notice fetches, so the list paints
  // as soon as its own page lands even when the rest of the board is loading.
  const loadPackages = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    if (token === 'demo-token') {
      packagesPageRef.current = 0
      packagesTotalPagesRef.current = 1
      patch((prev) => ({
        packages: prev.packages.length > 0 ? prev.packages : [...DEMO_PACKAGES],
        packagesPage: 0,
        packagesTotalPages: 1,
        packagesTotalCount: (prev.packages.length > 0 ? prev.packages : DEMO_PACKAGES).length,
        hasMorePackages: false,
        error: null,
      }))
      return true
    }
    try {
      const res = await api.fetchMyPackages(token, {
        page: packagesPageRef.current,
        size: PACKAGES_PAGE_SIZE,
      })
      packagesPageRef.current = res.myPackages.currentPage
      packagesTotalPagesRef.current = res.myPackages.totalPages
      patch({
        packages: res.myPackages.items.map((p) => toPackageItem(p, meId)),
        packagesPage: res.myPackages.currentPage,
        packagesTotalPages: res.myPackages.totalPages,
        packagesTotalCount: res.myPackages.totalCount,
        hasMorePackages: res.myPackages.currentPage < res.myPackages.totalPages - 1,
        error: null,
      })
      return true
    } catch (error) {
      return fail(error, true)
    }
  }, [token, meId, patch, fail])

  // Operational board data: offers, transfers, drivers, office. Secondary to
  // the packages list — failures are silent (the GraphQL subscriptions + 60 s
  // sync heal it), so a hiccup in the custody board never banners over an
  // otherwise healthy screen.
  const loadOperational = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    if (token === 'demo-token') {
      patch((prev) => ({
        offers: prev.offers.length > 0 ? prev.offers : [...DEMO_OFFERS],
        pendingTransfers: prev.pendingTransfers.length > 0 ? prev.pendingTransfers : [...DEMO_TRANSFERS],
        requestedTransfers: [],
        myTransfers: [],
        drivers: DEMO_DRIVERS,
        office: DEMO_OFFICE,
        lastSync: Date.now(),
      }))
      return true
    }
    try {
      const [offersRes, pendingRes, requestedRes, mineRes, driversRes, meRes] = await Promise.all([
        api.fetchAvailablePackages(token),
        api.fetchTransfersByStatus(token, 'PENDING'),
        api.fetchTransfersByStatus(token, 'REQUESTED'),
        api.fetchMyTransfers(token),
        api.fetchDrivers(token),
        api.fetchMyCompany(token),
      ])
      patch({
        offers: offersRes.availablePackages.items,
        pendingTransfers: pendingRes.transfersByStatus,
        requestedTransfers: requestedRes.transfersByStatus,
        myTransfers: mineRes.myTransfers,
        drivers: driversRes.searchUsers,
        office: meRes?.office ?? null,
        lastSync: Date.now(),
      })
      return true
    } catch (error) {
      return fail(error, false)
    }
  }, [token, patch, fail])

  // Combined reloader used by the background sync and the realtime events —
  // packages + operational data, notices excluded (they have their own feed).
  const loadWorkspace = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all([loadPackages(), loadOperational()])
    return results.some(Boolean)
  }, [loadPackages, loadOperational])

  // Server-side pagination: fetch a specific page and replace the visible list.
  // Bounds are clamped to the known page range; re-fetching the current page is
  // a no-op (sync + mutations already keep it fresh).
  const goToPage = useCallback(
    async (page: number): Promise<void> => {
      if (!token || pageLoadingRef.current) return
      const bounded = Math.max(0, Math.min(page, packagesTotalPagesRef.current - 1))
      if (bounded === packagesPageRef.current) return
      pageLoadingRef.current = true
      patch({ pageLoading: true, error: null })
      try {
        const res = await api.fetchMyPackages(token, { page: bounded, size: PACKAGES_PAGE_SIZE })
        packagesPageRef.current = res.myPackages.currentPage
        packagesTotalPagesRef.current = res.myPackages.totalPages
        patch({
          packages: res.myPackages.items.map((p) => toPackageItem(p, meId)),
          packagesPage: res.myPackages.currentPage,
          packagesTotalPages: res.myPackages.totalPages,
          packagesTotalCount: res.myPackages.totalCount,
          hasMorePackages: res.myPackages.currentPage < res.myPackages.totalPages - 1,
        })
      } catch (error) {
        if (isAuthError(error)) handleSessionExpired()
      } finally {
        pageLoadingRef.current = false
        patch({ pageLoading: false })
      }
    },
    [token, meId, patch, handleSessionExpired],
  )

  // Notice feed — initial fetch + periodic sync fallback.
  const loadNotices = useCallback(async (): Promise<boolean> => {
    if (!token) return false
    if (token === 'demo-token') {
      patch((prev) => ({
        notices: prev.notices.length > 0 ? prev.notices : [...DEMO_NOTICES],
        unread: prev.notices.length > 0 ? prev.unread : 2,
      }))
      return true
    }
    try {
      const [noticesRes, unreadRes] = await Promise.all([api.fetchMyNotices(token), api.fetchUnreadCount(token)])
      patch({ notices: noticesRes.myNotices, unread: unreadRes.unreadNoticeCount })
      return true
    } catch (error) {
      // Silent — notices are pushed via the GraphQL subscription; a failed fetch must
      // not trip the workspace error banner.
      return fail(error, false)
    }
  }, [token, patch, fail])

  const loadAll = useCallback(async (): Promise<boolean> => {
    const results = await Promise.all([loadWorkspace(), loadNotices()])
    return results.some(Boolean)
  }, [loadWorkspace, loadNotices])

  const refresh = useCallback(async () => {
    patch({ refreshing: true })
    await loadAll()
    patch({ refreshing: false })
  }, [patch, loadAll])

  // Persist the currently open package page so a reload restores the list
  // without waiting for the network. Scoped to the signed-in user.
  useEffect(() => {
    if (status !== 'signedIn' || !meId) return
    if (state.packages.length === 0) return
    try {
      sessionStorage.setItem(
        PACKAGES_CACHE_KEY,
        JSON.stringify({
          owner: meId,
          savedAt: Date.now(),
          packages: state.packages,
          page: state.packagesPage,
          totalPages: state.packagesTotalPages,
          totalCount: state.packagesTotalCount,
        }),
      )
    } catch {
      /* quota exceeded — ignore */
    }
  }, [status, meId, state.packages, state.packagesPage, state.packagesTotalPages, state.packagesTotalCount])

  // Restore the cached package page (per user) BEFORE the first network sync
  // so a reload paints the previously open page instantly; loadWorkspace then
  // refetches the same page in the background and refreshes the data.
  // Declared before the initial-load effect so hydration always wins the race.
  useEffect(() => {
    if (status !== 'signedIn' || !meId) return
    // Only hydrate before any fresh data has arrived.
    if (packagesCacheHydratedRef.current || stateRef.current.lastSync) return
    try {
      const raw = sessionStorage.getItem(PACKAGES_CACHE_KEY)
      if (!raw) return
      const cached = JSON.parse(raw) as {
        owner: string
        savedAt: number
        packages: PackageItem[]
        page: number
        totalPages: number
        totalCount: number
      }
      if (cached.owner !== meId) return
      if (!Array.isArray(cached.packages) || cached.packages.length === 0) return
      if (Date.now() - cached.savedAt > PACKAGES_CACHE_TTL_MS) return
      packagesCacheHydratedRef.current = true
      packagesPageRef.current = cached.page
      packagesTotalPagesRef.current = cached.totalPages
      patch({
        packages: cached.packages,
        packagesPage: cached.page,
        packagesTotalPages: cached.totalPages,
        packagesTotalCount: cached.totalCount,
        hasMorePackages: cached.page < cached.totalPages - 1,
      })
    } catch {
      /* corrupt cache — start fresh */
    }
  }, [status, meId, patch])

  // Clear the cache on sign-out so another user in the same tab never sees it.
  useEffect(() => {
    if (status === 'signedIn') return
    try {
      sessionStorage.removeItem(PACKAGES_CACHE_KEY)
    } catch {
      /* ignore */
    }
    packagesCacheHydratedRef.current = false
    packagesPageRef.current = 0
    packagesTotalPagesRef.current = 1
  }, [status])

  // Initial load + slow background sync for the operational board. Each section
  // loads through its own flag and patches its own slice, so the packages list
  // paints the instant its first page lands — no single slow endpoint (offers,
  // transfers, office, notices) can hold back the primary content.
  useEffect(() => {
    if (status !== 'signedIn' || !token) return
    // Fresh session — restart pagination from page 0, unless cached pages were
    // restored above (they are refetched and refreshed in place).
    if (!packagesCacheHydratedRef.current) {
      packagesPageRef.current = 0
      packagesTotalPagesRef.current = 1
    }
    patch({ packagesLoading: true, operationalLoading: true, noticesLoading: true })
    void loadPackages().finally(() => patch({ packagesLoading: false }))
    void loadOperational().finally(() => patch({ operationalLoading: false }))
    void loadNotices().finally(() => patch({ noticesLoading: false }))
    const interval = window.setInterval(() => {
      if (document.hidden) return
      void loadWorkspace()
    }, SYNC_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [status, token, loadPackages, loadOperational, loadNotices, loadWorkspace, patch])

  // GraphQL subscription — instant cue + refresh for newly created package+transfer events.
  // Reconnects with bounded backoff when the WebSocket drops.
  useEffect(() => {
    if (status !== 'signedIn' || !token || typeof window === 'undefined') return
    let stop = false
    let unsubscribe = () => {}
    let attempts = 0
    const connect = () => {
      if (stop) return
      // Close any lingering socket before opening a new one — onError can fire
      // while the previous connection is still alive. close() is idempotent.
      unsubscribe()
      unsubscribe = subscribeGraphql<{ newPackageTransfer: { deliveryPackage: { trackingCode: string } } }>({
        token,
        query: `subscription NewPackageTransfer {
          newPackageTransfer {
            deliveryPackage { id trackingCode status }
            transfer { id ruleType acceptorType status }
          }
        }`,
        onNext: (data) => {
          const code = data.newPackageTransfer?.deliveryPackage?.trackingCode
          toast.info(code ? `New package ${code} is ready to accept` : 'New package offer received')
          void loadWorkspace()
        },
        onError: () => {
          if (stop) return
          attempts += 1
          if (attempts < 5) {
            window.setTimeout(connect, Math.min(attempts * 4_000, 20_000))
          } else {
            console.warn('[realtime] GraphQL subscription gave up after retries — using the 60s sync')
          }
        },
      })
    }
    connect()
    return () => {
      stop = true
      unsubscribe()
    }
  }, [status, token, loadWorkspace])

  // GraphQL subscription — real-time transfer requests feed (e.g. driver transferring to office).
  useEffect(() => {
    if (status !== 'signedIn' || !token || typeof window === 'undefined') return
    let stop = false
    let unsubscribe = () => {}
    let attempts = 0
    const connect = () => {
      if (stop) return
      unsubscribe()
      unsubscribe = subscribeGraphql<{ transferCreated: { transfer: { id: string; ruleType: string; acceptorType: string; status: string } } }>({
        token,
        query: `subscription TransferCreated {
          transferCreated {
            transfer { id ruleType acceptorType status }
          }
        }`,
        onNext: () => {
          toast.info('New transfer request received')
          void loadWorkspace()
        },
        onError: () => {
          if (stop) return
          attempts += 1
          if (attempts < 5) {
            window.setTimeout(connect, Math.min(attempts * 4_000, 20_000))
          }
        },
      })
    }
    connect()
    return () => {
      stop = true
      unsubscribe()
    }
  }, [status, token, loadWorkspace])

  // GraphQL subscription — real-time offer claimed / accepted notifications.
  // Broadcast when any driver or worker accepts an offer so other users instantly
  // see the offer removed from open offers and marked as taken without waiting for polling.
  useEffect(() => {
    if (status !== 'signedIn' || !token || typeof window === 'undefined') return
    let stop = false
    let unsubscribe = () => {}
    let attempts = 0
    const connect = () => {
      if (stop) return
      unsubscribe()
      unsubscribe = subscribeGraphql<{
        offerClaimed: {
          packageId: string
          trackingCode: string
          transferId: string | null
          claimedByUserId: string
          claimedByRole: string
          claimedAt: string
        }
      }>({
        token,
        query: `subscription OfferClaimed {
          offerClaimed {
            packageId
            trackingCode
            transferId
            claimedByUserId
            claimedByRole
            claimedAt
          }
        }`,
        onNext: (data) => {
          const event = data.offerClaimed
          if (!event) return
          patch((prev) => {
            const pkgId = event.packageId
            const transferId = event.transferId
            const nextOffers = prev.offers.filter(
              (p) => p.id !== pkgId && (!transferId || !p.transfers?.some((t) => t.id === transferId))
            )
            const nextPendingTransfers = prev.pendingTransfers.filter(
              (t) => t.id !== transferId && !t.packages?.some((tp) => tp.packageId === pkgId)
            )
            const nextRequestedTransfers = prev.requestedTransfers.filter(
              (t) => t.id !== transferId && !t.packages?.some((tp) => tp.packageId === pkgId)
            )
            return {
              offers: nextOffers,
              pendingTransfers: nextPendingTransfers,
              requestedTransfers: nextRequestedTransfers,
            }
          })
          const roleLabel = event.claimedByRole.toLowerCase()
          toast.info(`Offer ${event.trackingCode || ''} was accepted by a ${roleLabel}`)
          void loadWorkspace()
        },
        onError: () => {
          if (stop) return
          attempts += 1
          if (attempts < 5) {
            window.setTimeout(connect, Math.min(attempts * 4_000, 20_000))
          } else {
            console.warn('[realtime] offerClaimed subscription gave up after retries')
          }
        },
      })
    }
    connect()
    return () => {
      stop = true
      unsubscribe()
    }
  }, [status, token, patch, loadWorkspace])

  // GraphQL subscription — real-time notice feed via WebSocket (replaces Supabase Realtime).
  // New notices are pushed instantly; falls back to the 60s polling interval on failure.
  useEffect(() => {
    if (status !== 'signedIn' || !token || typeof window === 'undefined') return
    let stop = false
    let unsubscribe = () => {}
    let attempts = 0
    const connect = () => {
      if (stop) return
      unsubscribe()
      unsubscribe = subscribeGraphql<{
        noticeCreated: {
          id: string
          resourceType: string
          resourceId: string
          eventType: string
          actorId: string | null
          title: string
          message: string
          payload: string | null
          viewer: { id: string; noticeId: string; userId: string; deliveredAt: string | null; readAt: string | null }
          createdAt: string
        }
      }>({
        token,
        query: `subscription NoticeCreated {
          noticeCreated {
            id resourceType resourceId eventType actorId title message payload
            viewer { id noticeId userId deliveredAt readAt }
            createdAt
          }
        }`,
        onNext: (data) => {
          const notice = data.noticeCreated
          if (!notice) return
          patch((prev) => {
            // Deduplicate — the 60s sync may have already fetched this notice.
            if (prev.notices.some((n) => n.viewer.id === notice.viewer.id)) return {}
            return {
              notices: [notice, ...prev.notices],
              unread: prev.unread + 1,
            }
          })
          toast.info(notice.title)
        },
        onError: () => {
          if (stop) return
          attempts += 1
          if (attempts < 5) {
            window.setTimeout(connect, Math.min(attempts * 4_000, 20_000))
          } else {
            console.warn('[realtime] notice subscription gave up after retries — using the 60s sync')
          }
        },
      })
    }
    connect()
    return () => {
      stop = true
      unsubscribe()
    }
  }, [status, token, patch])

  // ── Local key-value helpers (secure transfer codes) ────────────────

  const saveSecureCode = useCallback((transferId: string, code: string) => {
    const next = { ...readRecord(SECURE_KEY), [transferId]: code }
    writeRecord(SECURE_KEY, next)
    patch({ secureCodes: next })
  }, [patch])

  const getSecureCode = useCallback((transferId: string) => readRecord(SECURE_KEY)[transferId], [])

  // ── Mutations ────────────────────────────────────────────────────────────

  const runMutation = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      try {
        const result = await fn()
        // Refresh the board in the background — the caller has already awaited
        // the mutation itself, so a slow full reload must not hold up the
        // optimistic state patches (rows vanishing from the inbox, badges, etc).
        void loadAll()
        return result
      } catch (error) {
        if (isAuthError(error)) {
          handleSessionExpired()
          throw error
        }
        const message = error instanceof Error ? error.message : 'Operation failed'
        toast.error(message)
        throw error
      }
    },
    [loadAll, handleSessionExpired],
  )

  const acceptTransfer = useCallback(
    async (transferId: string, code?: string, opts?: { successMessage?: string }) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          pendingTransfers: prev.pendingTransfers.filter((t) => t.id !== transferId),
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
        }))
        toast.success(opts?.successMessage ?? 'Transfer accepted')
        return
      }
      await runMutation(() => api.acceptTransfer(token!, transferId, code))
      // Immediately remove the accepted transfer from local state so it
      // disappears from the inbox without waiting for the next 60 s sync.
      patch((prev) => ({
        pendingTransfers: prev.pendingTransfers.filter((t) => t.id !== transferId),
        requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
      }))
      toast.success(opts?.successMessage ?? 'Transfer accepted')
    },
    [token, runMutation, patch],
  )

  const claimPackage = useCallback(
    async (packageId: string) => {
      if (token === 'demo-token') {
        const offer = state.offers.find((o) => o.id === packageId)
        if (offer) {
          const item = toPackageItem(offer, meId)
          item.isMine = true
          item.status = 'ORIGIN_OFFICE'
          patch((prev) => ({
            offers: prev.offers.filter((o) => o.id !== packageId),
            packages: [item, ...prev.packages],
            packagesTotalCount: prev.packagesTotalCount + 1,
          }))
        }
        toast.success('Transfer accepted — package added to your custody')
        return
      }
      let resolvedTransferId: string | undefined
      await runMutation(async () => {
        // Accept an existing transfer offer on this package.
        // First try the local offers state (fast path); if the transfer is not
        // found (stale state), fall back to a fresh fetch from the backend.
        resolvedTransferId = state.offers
          .find((o) => o.id === packageId)
          ?.transfers.find((t) => t.status === 'PENDING')
          ?.id

        if (!resolvedTransferId) {
          // Stale or missing from local state — fetch the package directly
          const { package: pkg } = await api.fetchPackageById(token!, packageId)
          resolvedTransferId = pkg.transfers.find(
            (t) => t.status === 'PENDING',
          )?.id
        }

        if (!resolvedTransferId) {
          throw new Error('No pending transfer found for this package')
        }

        await api.acceptTransfer(token!, resolvedTransferId)
      })
      patch((prev) => ({
        offers: prev.offers.filter((o) => o.id !== packageId),
        pendingTransfers: resolvedTransferId ? prev.pendingTransfers.filter((t) => t.id !== resolvedTransferId) : prev.pendingTransfers,
      }))
      toast.success('Transfer accepted — package added to your custody')
    },
    [token, runMutation, patch, state.offers, meId],
  )

  const createPackage = useCallback(
    async (input: api.CreatePackageInput) => {
      if (token === 'demo-token') {
        const codeNum = Math.floor(100000 + Math.random() * 900000)
        const code = `CAV-${codeNum}`
        const newPkg: PackageItem = {
          id: `pkg-${Date.now()}`,
          trackingCode: code,
          deliveryType: input.deliveryType,
          status: 'ORIGIN_OFFICE',
          sender: input.sender?.name ? `${input.sender.name} (${input.sender.phone || ''})` : 'Sender',
          receiver: `${input.receiver.name || 'Receiver'} (${input.receiver.phone || ''})`,
          origin: input.origin.placeName || 'Nyabugogo Central Depot',
          destination: input.destination.placeName || 'Destination Office',
          weight: input.details?.weight ? `${input.details.weight} kg` : null,
          category: input.details?.category || 'General',
          description: input.details?.description || 'Package intake registered',
          fragile: Boolean(input.details?.fragile),
          photos: [],
          currentCustodian: { userId: meId, name: 'Jean Mukasa', role: 'WORKER' },
          assignedDriver: null,
          isMine: true,
          isCreator: true,
          openTransfer: null,
          events: [
            {
              id: `evt-${Date.now()}`,
              eventType: 'PACKAGE_CREATED',
              actorId: meId,
              description: 'Package registered and intake verified at Nyabugogo Depot',
              createdAt: new Date().toISOString(),
            },
          ],
          custody: [
            {
              id: `cst-${Date.now()}`,
              fromEntity: input.sender?.name || 'Sender',
              toEntity: 'Jean Mukasa (Worker)',
              timestamp: new Date().toISOString(),
              notes: 'Handed over at front counter',
            },
          ],
          updatedAt: new Date().toISOString(),
        }
        patch((prev) => ({
          packages: [newPkg, ...prev.packages],
          packagesTotalCount: prev.packagesTotalCount + 1,
        }))
        toast.success('Package created')
        return { packageId: newPkg.id, transferId: null, secureCode: null }
      }
      return runMutation(async () => {
        const { createPackage } = await api.createPackage(token!, input)
        const packageId = createPackage.deliveryPackage.id
        const secureCode =
          createPackage.transfer?.ruleType === 'SECURE' && createPackage.transfer.transferCode
            ? createPackage.transfer.transferCode
            : null
        if (secureCode) saveSecureCode(createPackage.transfer!.id, secureCode)
        return {
          packageId,
          transferId: createPackage.transfer?.id ?? null,
          secureCode,
        }
      }).then((result) => {
        toast.success('Package created')
        return result
      })
    },
    [token, runMutation, saveSecureCode, meId, patch],
  )

  const assignDriver = useCallback(
    async (packageId: string, driverId: string) => {
      if (token === 'demo-token') {
        const driver = state.drivers.find((d) => d.id === driverId)
        const driverName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() : 'Assigned Driver'
        patch((prev) => ({
          packages: prev.packages.map((p) => {
            if (p.id !== packageId) return p
            return {
              ...p,
              assignedDriver: driverName,
              status: 'ASSIGNED_DRIVER',
              events: [
                {
                  id: `evt-${Date.now()}`,
                  eventType: 'DRIVER_ASSIGNED',
                  actorId: meId,
                  description: `${driverName} assigned for express route`,
                  createdAt: new Date().toISOString(),
                },
                ...p.events,
              ],
            }
          }),
        }))
        toast.success('Driver assigned')
        return
      }
      await runMutation(() => api.assignDriver(token!, packageId, driverId, meId))
      toast.success('Driver assigned')
    },
    [token, meId, runMutation, state.drivers, patch],
  )

  const advanceStatus = useCallback(
    async (packageId: string, status: PackageStatus, opts?: { notes?: string }) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          packages: prev.packages.map((p) => (p.id === packageId ? { ...p, status } : p)),
        }))
        toast.success(`Status updated to ${status}`)
        return
      }
      await runMutation(() => api.updatePackageStatus(token!, packageId, status, opts?.notes))
    },
    [token, runMutation, patch],
  )

  const initiateDelivery = useCallback(
    async (packageId: string) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          packages: prev.packages.map((p) => (p.id === packageId ? { ...p, status: 'PENDING_CONFIRMATION' } : p)),
        }))
        toast.success('Delivery initiated — confirmation code sent to recipient')
        return
      }
      await runMutation(() => api.initiateDelivery(token!, packageId))
    },
    [token, runMutation, patch],
  )

  const confirmDelivery = useCallback(
    (packageId: string, deliveryCode: string) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          packages: prev.packages.map((p) => (p.id === packageId ? { ...p, status: 'DELIVERED' } : p)),
        }))
        toast.success('Delivery confirmed')
        return Promise.resolve()
      }
      return runMutation(() => api.confirmDelivery(token!, packageId, deliveryCode)).then(() => {
        toast.success('Delivery confirmed')
      })
    },
    [token, runMutation, patch],
  )

  const regenerateDeliveryCode = useCallback(
    async (packageId: string) => {
      if (token === 'demo-token') {
        toast.success('Fresh delivery code generated (demo: 839201)')
        return
      }
      await runMutation(() => api.regenerateDeliveryCode(token!, packageId))
    },
    [token, runMutation],
  )

  const createTransferForPackages = useCallback(
    async (packageIds: string[], ruleType: TransferRuleType, matchUserId?: string | null) => {
      if (token === 'demo-token') {
        toast.success('Transfer created for selected packages')
        return {
          id: `trf-${Date.now()}`,
          creatorId: meId,
          ruleType,
          acceptorType: 'DRIVER' as const,
          matchCompanyId: 'cmp-twese-express',
          matchUserId: matchUserId ?? null,
          requestorId: null,
          status: 'PENDING' as const,
          transferCode: ruleType === 'SECURE' ? '884920' : null,
          packages: packageIds.map((id) => ({
            id: `tpl-${Date.now()}-${id}`,
            transferId: `trf-${Date.now()}`,
            packageId: id,
            addedBy: meId,
            addedAt: new Date().toISOString(),
          })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      }
      const result = await runMutation(() =>
        api.createTransfer(token!, packageIds, ruleType, 'DRIVER', matchUserId)
      )
      return result.createTransfer
    },
    [token, runMutation, meId],
  )

  const cancelTransfer = useCallback(
    (transferId: string) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          pendingTransfers: prev.pendingTransfers.filter((t) => t.id !== transferId),
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
          myTransfers: prev.myTransfers.filter((t) => t.id !== transferId),
        }))
        toast.success('Transfer cancelled')
        return Promise.resolve()
      }
      return runMutation(() => api.cancelTransfer(token!, transferId)).then(() => {
        patch((prev) => ({
          pendingTransfers: prev.pendingTransfers.filter((t) => t.id !== transferId),
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
          myTransfers: prev.myTransfers.filter((t) => t.id !== transferId),
        }))
        toast.success('Transfer cancelled')
      })
    },
    [token, runMutation, patch],
  )

  const confirmTransfer = useCallback(
    (transferId: string) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          pendingTransfers: prev.pendingTransfers.filter((t) => t.id !== transferId),
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
          myTransfers: prev.myTransfers.map((t) => (t.id === transferId ? { ...t, status: 'DONE' as const } : t)),
        }))
        toast.success('Transfer confirmed — packages accepted')
        return Promise.resolve()
      }
      return runMutation(() => api.confirmTransfer(token!, transferId)).then(() => {
        patch((prev) => ({
          pendingTransfers: prev.pendingTransfers.filter((t) => t.id !== transferId),
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
          myTransfers: prev.myTransfers.map((t) =>
            t.id === transferId ? { ...t, status: 'DONE' as const } : t,
          ),
        }))
        toast.success('Transfer confirmed — packages accepted')
      })
    },
    [token, runMutation, patch],
  )

  const rejectTransfer = useCallback(
    (transferId: string) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
          myTransfers: prev.myTransfers.map((t) => (t.id === transferId ? { ...t, status: 'PENDING' as const, requestorId: null } : t)),
        }))
        toast.success('Transfer request rejected')
        return Promise.resolve()
      }
      return runMutation(() => api.rejectTransfer(token!, transferId)).then(() => {
        patch((prev) => ({
          requestedTransfers: prev.requestedTransfers.filter((t) => t.id !== transferId),
          myTransfers: prev.myTransfers.map((t) =>
            t.id === transferId ? { ...t, status: 'PENDING' as const, requestorId: null } : t,
          ),
        }))
        toast.success('Transfer request rejected')
      })
    },
    [token, runMutation, patch],
  )

  const regenerateTransferCode = useCallback(
    async (transferId: string) => {
      if (token === 'demo-token') {
        const code = '654321'
        saveSecureCode(transferId, code)
        toast.success('Transfer code regenerated: 654321')
        return code
      }
      const result = await runMutation(() => api.regenerateTransferCode(token!, transferId))
      const code = result.regenerateTransferCode.transferCode
      if (code) saveSecureCode(transferId, code)
      return code ?? ''
    },
    [token, runMutation, saveSecureCode],
  )

  const markRead = useCallback(
    async (viewerId: string) => {
      if (token === 'demo-token') {
        patch((prev) => ({
          notices: prev.notices.map((n) =>
            n.viewer.id === viewerId ? { ...n, viewer: { ...n.viewer, readAt: new Date().toISOString() } } : n,
          ),
          unread: Math.max(0, prev.unread - 1),
        }))
        return
      }
      await runMutation(() => api.markNoticeRead(token!, viewerId))
      patch((prev) => ({
        notices: prev.notices.map((n) =>
          n.viewer.id === viewerId ? { ...n, viewer: { ...n.viewer, readAt: new Date().toISOString() } } : n,
        ),
        unread: Math.max(0, prev.unread - 1),
      }))
    },
    [token, runMutation, patch],
  )

  const markAllRead = useCallback(async () => {
    if (token === 'demo-token') {
      patch((prev) => ({
        notices: prev.notices.map((n) => ({ ...n, viewer: { ...n.viewer, readAt: new Date().toISOString() } })),
        unread: 0,
      }))
      return
    }
    const unread = state.notices.filter((n) => !n.viewer.readAt)
    if (unread.length === 0) return
    await runMutation(async () => {
      for (const notice of unread) {
        await api.markNoticeRead(token!, notice.viewer.id)
      }
    })
    patch((prev) => ({
      notices: prev.notices.map((n) => (n.viewer.readAt ? n : { ...n, viewer: { ...n.viewer, readAt: new Date().toISOString() } })),
      unread: 0,
    }))
  }, [token, runMutation, patch, state.notices])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      refresh,
      goToPage,
      acceptTransfer,
      claimPackage,
      createPackage,
      assignDriver,
      advanceStatus,
      initiateDelivery,
      confirmDelivery,
      regenerateDeliveryCode,
      createTransferForPackages,
      cancelTransfer,
      confirmTransfer,
      rejectTransfer,
      regenerateTransferCode,
      markRead,
      markAllRead,
      saveSecureCode,
      getSecureCode,
    }),
    [
      state, refresh, goToPage, acceptTransfer, claimPackage, createPackage, assignDriver, advanceStatus,
      initiateDelivery, confirmDelivery, regenerateDeliveryCode, createTransferForPackages,
      cancelTransfer, confirmTransfer, rejectTransfer, regenerateTransferCode, markRead, markAllRead,
      saveSecureCode, getSecureCode,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  return ctx
}
