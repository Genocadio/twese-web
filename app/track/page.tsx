'use client'

import { Suspense, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowRight,
  Box,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Compass,
  Loader2,
  MapPin,
  Package,
  Search,
  ShieldCheck,
  Truck,
  User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { fetchPackageByTrackingCode } from '@/lib/api'
import type { PackageItem } from '@/lib/types'
import { statusLabel } from '@/lib/format'

function TrackContent() {
  const searchParams = useSearchParams()
  const initialCode = searchParams.get('code') || ''

  const [trackingCode, setTrackingCode] = useState(initialCode)
  const [busy, setBusy] = useState(false)
  const [pkg, setPkg] = useState<PackageItem | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  async function handleTrack(codeToLookup: string) {
    const code = codeToLookup.trim().toUpperCase()
    if (!code) return
    setError(null)
    setBusy(true)
    setSearched(true)
    try {
      const result = await fetchPackageByTrackingCode(code)
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
    if (initialCode) {
      handleTrack(initialCode)
    }
  }, [initialCode])

  function getStatusColor(status: string) {
    switch (status) {
      case 'DELIVERED':
        return 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
      case 'OUT_FOR_DELIVERY':
      case 'IN_TRANSIT':
        return 'bg-blue-500/10 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400'
      case 'DESTINATION_OFFICE':
      case 'TRANSFER_OFFICE':
        return 'bg-purple-500/10 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400'
      case 'ORIGIN_OFFICE':
        return 'bg-amber-500/10 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
      default:
        return 'bg-muted text-muted-foreground border-border'
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <ChevronLeft className="size-4" />
            <span>Worker Console</span>
          </Link>
          <div className="flex items-center gap-2">
            <Image src="/logo.png" width={28} height={28} alt="Twese" className="size-7 object-contain" />
            <span className="font-mono text-sm font-bold tracking-tight">TWESE TRACK</span>
          </div>
        </div>

        {/* Hero / Search Section */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 text-xs font-semibold">
            <Compass className="size-3.5" />
            <span>Live Delivery Tracking</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Track Your Package</h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
            Enter your Twese tracking code below to check real-time transit status, custodian handoffs, and arrival estimates.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleTrack(trackingCode)
            }}
            className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto pt-3"
          >
            <div className="relative flex-grow">
              <Search className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
              <Input
                type="text"
                value={trackingCode}
                onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                placeholder="Enter tracking code (e.g. CAV-123456)"
                className="h-11 pl-10 font-mono text-sm uppercase tracking-wider"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={busy || !trackingCode.trim()}
              className="h-11 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold cursor-pointer gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span>{busy ? 'Tracking…' : 'Track'}</span>
            </Button>
          </form>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
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
                <p className="text-xs text-muted-foreground mt-0.5">
                  Delivery mode: <span className="font-medium text-foreground">{pkg.deliveryType.replace('_', ' ')}</span>
                </p>
              </div>
              <Badge variant="outline" className={`px-3 py-1 font-semibold text-xs border ${getStatusColor(pkg.status)}`}>
                {statusLabel(pkg.status)}
              </Badge>
            </div>

            {/* Route & Custody Highlights */}
            <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 border-b border-border">
              {/* Origin & Destination */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Route Overview</h3>
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 size-3 rounded-full bg-blue-500 border-2 border-background" />
                    <p className="text-[11px] font-semibold text-muted-foreground">ORIGIN</p>
                    <p className="text-xs font-medium text-foreground">{pkg.origin}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">From: {pkg.sender}</p>
                  </div>
                  <div className="relative">
                    <span className="absolute -left-6 top-0.5 size-3 rounded-full bg-emerald-500 border-2 border-background" />
                    <p className="text-[11px] font-semibold text-muted-foreground">DESTINATION</p>
                    <p className="text-xs font-medium text-foreground">{pkg.destination}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">To: {pkg.receiver}</p>
                  </div>
                </div>
              </div>

              {/* Package Details */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Package Attributes</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 rounded-xl bg-muted/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Category</span>
                    <span className="font-medium">{pkg.category || 'Standard Goods'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Weight</span>
                    <span className="font-medium">{pkg.weight || 'Unspecified'}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/40 col-span-2">
                    <span className="text-[10px] text-muted-foreground uppercase block font-semibold">Handling</span>
                    <span className="font-medium">
                      {pkg.fragile ? '⚠️ Handle with care (Fragile)' : 'Standard Handling'}
                    </span>
                  </div>
                </div>

                {pkg.description && (
                  <p className="text-xs text-muted-foreground bg-muted/20 p-2.5 rounded-lg italic">
                    &ldquo;{pkg.description}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Photos (if attached) */}
            {pkg.photos && pkg.photos.length > 0 && (
              <div className="p-5 sm:p-6 border-b border-border space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Proof / Condition Photos ({pkg.photos.length})
                </h3>
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {pkg.photos.map((photo, index) => (
                    <a
                      key={index}
                      href={photo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-xl overflow-hidden border border-border shadow-xs hover:opacity-90 transition"
                    >
                      <img src={photo} alt={`Package photo ${index + 1}`} className="size-20 sm:size-24 object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Event Timeline */}
            <div className="p-5 sm:p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Tracking Timeline</h3>
              {pkg.events && pkg.events.length > 0 ? (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                  {pkg.events.map((evt, idx) => (
                    <div key={evt.id || idx} className="relative">
                      <span className="absolute -left-6 top-1 size-2.5 rounded-full bg-blue-600 border-2 border-background" />
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs gap-1">
                        <span className="font-semibold text-foreground">{evt.description || evt.eventType}</span>
                        <span className="text-[11px] text-muted-foreground">
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
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl">
                  <Clock className="size-4" />
                  <span>Package custody initialized. Further updates will appear as it moves along its route.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer info */}
        <p className="text-center text-[11px] text-muted-foreground">
          Twese Delivery System &bull; Powered by CavGo Logistics &bull; Kigali, Rwanda
        </p>
      </div>
    </div>
  )
}

export default function TrackPage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-background">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TrackContent />
    </Suspense>
  )
}
