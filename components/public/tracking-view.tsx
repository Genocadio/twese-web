'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  Clock,
  Compass,
  Copy,
  Loader2,
  MessageCircle,
  Package,
  Search,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchPublicTracking } from '@/lib/api'
import { statusLabel, trackingEventLabel } from '@/lib/format'
import { buildTrackingUrl, buildWhatsAppUrl } from '@/lib/share'
import type { PublicTracking } from '@/lib/types'

function getStatusColor(status: string) {
  switch (status) {
    case 'DELIVERED':
    case 'COMPLETED':
      return 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
    case 'PENDING_CONFIRMATION':
    case 'OUT_FOR_DELIVERY':
    case 'IN_TRANSIT':
      return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400'
    case 'DESTINATION_OFFICE':
    case 'READY_FOR_COLLECTION':
      return 'bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400'
    case 'ORIGIN_OFFICE':
    case 'ACCEPTED':
      return 'bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
    default:
      return 'bg-muted text-muted-foreground border-border'
  }
}

export function TrackingView({ initialCode }: { initialCode: string }) {
  const [trackingCode, setTrackingCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [pkg, setPkg] = useState<PublicTracking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleTrack(codeToLookup: string) {
    const code = codeToLookup.trim().toUpperCase()
    if (!code) return
    setError(null)
    setBusy(true)
    try {
      const result = await fetchPublicTracking(code)
      if (!result) {
        setError(`No package found for tracking code "${code}". Please check the code and try again.`)
        setPkg(null)
      } else {
        setPkg(result)
      }
    } catch (err: any) {
      setError(err?.message || 'Could not look up package tracking info. Please check your connection and try again.')
      setPkg(null)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setTrackingCode(initialCode)
    setCopied(false)
    if (initialCode) {
      void handleTrack(initialCode)
    } else {
      setPkg(null)
      setError(null)
    }
    // initialCode is the only trigger: manual searches should not re-run automatically.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode])

  async function copyLink() {
    if (!pkg) return
    try {
      await navigator.clipboard.writeText(buildTrackingUrl(pkg.trackingCode))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy the link. You can copy it from the address bar instead.')
    }
  }

  function shareOnWhatsApp() {
    if (!pkg) return
    window.open(buildWhatsAppUrl(pkg.trackingCode), '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-10">
      <div className="max-w-3xl mx-auto space-y-6 sm:space-y-8">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
          <Link
            href="/"
            className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-[0.98]"
          >
            <ChevronLeft className="size-5" />
            <span>Twese Home</span>
          </Link>
          <div className="flex items-center gap-2">
            <Image src="/logo.png" width={28} height={28} alt="Twese" className="size-7 object-contain" />
            <span className="font-mono text-base font-bold tracking-tight">TWESE TRACK</span>
          </div>
        </div>

        {/* Hero / Search Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-sm font-semibold">
            <Compass className="size-4" />
            <span>Live Delivery Tracking</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Track Your Package</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Enter your Twese tracking code to check the latest delivery status and route progress.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void handleTrack(trackingCode)
            }}
            className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto pt-3"
          >
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                placeholder="Enter tracking code (e.g. CAV-123456)"
                className="h-12 pl-11 font-mono text-base uppercase tracking-wider sm:h-11 sm:text-base"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={busy || !trackingCode.trim()}
              className="h-12 px-6 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold cursor-pointer gap-2 active:scale-[0.98] sm:h-11"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span>{busy ? 'Tracking…' : 'Track'}</span>
            </Button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <AlertCircle className="size-4 shrink-0 mt-0.5 text-red-600" />
            <div>
              <p className="font-semibold">Tracking Lookup Notice</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Package Card View */}
        {pkg && (
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden animate-in fade-in-50 duration-200">
            {/* Card Header */}
            <div className="border-b border-border bg-muted/30 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Package className="size-5 text-blue-600 dark:text-blue-400" />
                  <span className="font-mono text-lg font-bold tracking-tight">{pkg.trackingCode}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Delivery mode: <span className="font-medium text-foreground">{pkg.deliveryType.replace('_', ' ')}</span>
                </p>
              </div>
              <Badge variant="outline" className={`px-3 py-1.5 font-semibold text-sm border ${getStatusColor(pkg.status)}`}>
                {statusLabel(pkg.status)}
              </Badge>
            </div>

            {/* Share actions */}
            <div className="p-5 sm:p-6 border-b border-border flex flex-wrap items-center gap-2">
              <Button
                onClick={shareOnWhatsApp}
                className="h-11 gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm cursor-pointer active:scale-[0.98]"
              >
                <MessageCircle className="size-4" /> Share on WhatsApp
              </Button>
              <Button variant="outline" onClick={() => void copyLink()} className="h-11 gap-2 text-sm cursor-pointer active:scale-[0.98]">
                {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                {copied ? 'Link copied' : 'Copy link'}
              </Button>
              <span className="text-xs text-muted-foreground">
                The link opens Twese if installed, otherwise this tracking page.
              </span>
            </div>

            {/* Route Overview */}
            <div className="p-5 sm:p-6 border-b border-border space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Route Overview</h3>
              <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                <div className="relative">
                  <span className="absolute -left-6 top-0.5 size-3 rounded-full bg-blue-500 border-2 border-background" />
                  <p className="text-xs font-semibold text-muted-foreground">ORIGIN</p>
                  <p className="text-sm font-medium text-foreground">{pkg.origin}</p>
                </div>
                <div className="relative">
                  <span className="absolute -left-6 top-0.5 size-3 rounded-full bg-emerald-500 border-2 border-background" />
                  <p className="text-xs font-semibold text-muted-foreground">DESTINATION</p>
                  <p className="text-sm font-medium text-foreground">{pkg.destination}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="p-3 rounded-xl bg-muted/40">
                  <span className="text-xs text-muted-foreground uppercase block font-semibold">Created</span>
                  <span className="font-medium">
                    {new Date(pkg.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-muted/40">
                  <span className="text-xs text-muted-foreground uppercase block font-semibold">Last updated</span>
                  <span className="font-medium">
                    {new Date(pkg.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Event Timeline */}
            <div className="p-5 sm:p-6 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tracking Timeline</h3>
              {pkg.events && pkg.events.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {pkg.events.map((evt, idx) => (
                    <div key={`${evt.eventType}-${evt.createdAt}-${idx}`} className="relative">
                      <span className="absolute -left-6 top-1 size-2.5 rounded-full bg-blue-600 border-2 border-background" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-sm gap-1">
                        <span className="font-semibold text-foreground">{trackingEventLabel(evt.eventType)}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(evt.createdAt).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-3 rounded-xl">
                  <Clock className="size-4" />
                  <span>Package custody initialized. Further updates will appear as it moves along its route.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <p className="text-center text-xs text-muted-foreground">
          Twese Delivery System &bull; Powered by CavGo Logistics &bull; Kigali, Rwanda
        </p>
      </div>
    </div>
  )
}
