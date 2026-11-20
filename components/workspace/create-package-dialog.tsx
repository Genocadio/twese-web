'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Loader2, PackagePlus, UserRound, X, MapPin, Building2, Lock, ImagePlus, Film, RotateCcw } from 'lucide-react'
import { toast } from 'react-toastify'
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
import { useAuth } from '@/lib/auth'
import type { CompanyOffice, DeliveryType, TransferRuleType } from '@/lib/types'
import { cn } from '@/lib/utils'
import { searchLocations, uploadFile } from '@/lib/api'
import type { TripLocation } from '@/lib/api'
import { CodeRevealDialog } from './dialogs'
import { DriverPickerDialog } from './driver-picker-dialog'

const TRANSFER_RULES: Array<{ value: TransferRuleType | 'NONE'; label: string; hint: string }> = [
  { value: 'NONE', label: 'No transfer', hint: 'Package stays in your custody' },
  { value: 'AUTO', label: 'Auto', hint: 'Anyone can accept' },
  { value: 'SECURE', label: 'Code protected', hint: '8-char code required' },
  { value: 'CONFIRM', label: 'Two-step', hint: 'Request → owner confirms' },
]

function num(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}// Location display name: prefer custom_name, fall back to google_place_name, then code
function locationDisplayName(loc: TripLocation): string {
  return loc.custom_name || loc.google_place_name || loc.code || `Location #${loc.id}`
}

// The origin is locked to the worker's assigned office — display its location name.
function officeLocationName(office: CompanyOffice | null): string {
  if (!office) return ''
  return office.customName || office.googlePlaceName || office.name || office.address || office.city || ''
}

function officeBaseName(office: CompanyOffice | null): string {
  return office?.name || office?.companyName || ''
}

// Mirrors the backend's accepted MIME list (POST /api/files/upload).
const ACCEPTED_MEDIA = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'video/mp4',
  'video/quicktime',
  'video/webm',
].join(',')

const MAX_MEDIA_BYTES = 100 * 1024 * 1024 // 100 MB — backend limit

interface MediaAttachment {
  id: string
  file: File
  previewUrl: string
  /** Set once the backend has stored the file and returned a mediaId. */
  mediaId: string | null
  uploading: boolean
  error: string | null
}

function newAttachmentId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function LocationSuggestionInput({
  value,
  onChange,
  onLocationSelect,
  placeholder,
  icon,
}: {
  value: string
  onChange: (v: string) => void
  onLocationSelect?: (loc: TripLocation) => void
  placeholder: string
  icon?: React.ReactNode
}) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [results, setResults] = useState<TripLocation[]>([])
  const [searching, setSearching] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) { setResults([]); return }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const locs = await searchLocations(q, 15)
      setResults(locs)
      setSearching(false)
    }, 250)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          className={`flex h-9 w-full rounded-xl border border-border bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#f07c42] disabled:cursor-not-allowed disabled:opacity-50 ${icon ? 'pl-9' : ''}`}
          onFocus={() => setShowDropdown(true)}
          onChange={(e) => {
            onChange(e.target.value)
            doSearch(e.target.value)
            setShowDropdown(true)
          }}
        />
      </div>
      {showDropdown && (results.length > 0 || searching) && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-white shadow-lg dark:bg-zinc-900">
          {searching && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {results.map((loc) => {
            const name = locationDisplayName(loc)
            const sub = [loc.district, loc.province].filter(Boolean).join(', ')
            return (
              <button
                key={loc.id}
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-muted/50"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(name)
                  if (onLocationSelect) onLocationSelect(loc)
                  setShowDropdown(false)
                }}
              >
                <MapPin className="size-3 shrink-0 text-muted-foreground" />
                <span className="flex flex-col">
                  <span>{name}</span>
                  {sub && <span className="text-[10px] text-muted-foreground">{sub}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CreatePackageDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const workspace = useWorkspace()
  const { token } = useAuth()
  const { createPackage, drivers } = workspace
  const isPassengerOnly = workspace.isPassengerOnly
  const [busy, setBusy] = useState(false)
  // Web always creates FIXED_ROUTE packages (the Android app handles OPEN).
  const deliveryType: DeliveryType = 'FIXED_ROUTE'
  const [ruleType, setRuleType] = useState<TransferRuleType | 'NONE'>('AUTO')
  const [matchDriverId, setMatchDriverId] = useState<string | null>(null)
  const [matchDriverName, setMatchDriverName] = useState<string | null>(null)
  const [driverPickerOpen, setDriverPickerOpen] = useState(false)

  const [senderName, setSenderName] = useState('')
  const [senderPhone, setSenderPhone] = useState('')
  const [receiverName, setReceiverName] = useState('')
  const [receiverPhone, setReceiverPhone] = useState('')
  // The origin is not pickable — it is always the worker's assigned office.
  const office = workspace.office
  const originName = officeLocationName(office)
  const originCoords: [number, number] =
    office?.latitude != null && office?.longitude != null ? [office.latitude, office.longitude] : [0, 0]
  const originPlaceId = office?.placeId ?? null
  const originOfficeLocationId = office?.officeLocationId ?? null
  const [destName, setDestName] = useState('')
  const [destCoords, setDestCoords] = useState<[number, number]>([0, 0])
  const [destPlaceId, setDestPlaceId] = useState<string | null>(null)
  const [weight, setWeight] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [fragile, setFragile] = useState(false)

  const [reveal, setReveal] = useState<{ code: string | null } | null>(null)

  // ── Media attachments ────────────────────────────────────────────────────
  // Uploads start as soon as a file is picked; submit waits for every upload
  // and only sends mediaIds that came back successfully.
  const [attachments, setAttachments] = useState<MediaAttachment[]>([])
  const attachmentsRef = useRef<MediaAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isDemo = token === 'demo-token'
  const isUploading = attachments.some((a) => a.uploading)
  const hasFailedUploads = attachments.some((a) => !a.uploading && !a.mediaId)

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  // Object URLs live as long as the dialog; revoke them on unmount so previews
  // never leak memory across package creations.
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    }
  }, [])

  const startUpload = useCallback(
    async (attachment: MediaAttachment) => {
      if (!token) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.id === attachment.id ? { ...a, uploading: false, error: 'Session expired — sign in again' } : a,
          ),
        )
        return
      }
      try {
        const { mediaId } = await uploadFile(token, attachment.file, 'package-media')
        setAttachments((prev) =>
          prev.map((a) => (a.id === attachment.id ? { ...a, mediaId, uploading: false, error: null } : a)),
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed'
        setAttachments((prev) =>
          prev.map((a) => (a.id === attachment.id ? { ...a, uploading: false, error: message } : a)),
        )
        toast.error(`${attachment.file.name}: ${message}`)
      }
    },
    [token],
  )

  function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    if (isDemo) {
      toast.info('Photo uploads are disabled in demo mode')
      return
    }
    const allowed = new Set(ACCEPTED_MEDIA.split(','))
    const additions: MediaAttachment[] = []
    Array.from(files).forEach((file) => {
      if (!allowed.has(file.type)) {
        toast.error(`${file.name}: unsupported file type`)
        return
      }
      if (file.size > MAX_MEDIA_BYTES) {
        toast.error(`${file.name} is larger than 100 MB`)
        return
      }
      additions.push({
        id: newAttachmentId(),
        file,
        previewUrl: URL.createObjectURL(file),
        mediaId: null,
        uploading: true,
        error: null,
      })
    })
    if (additions.length === 0) return
    setAttachments((prev) => [...prev, ...additions])
    additions.forEach((attachment) => void startUpload(attachment))
  }

  function retryUpload(attachment: MediaAttachment) {
    const next = { ...attachment, uploading: true, error: null }
    setAttachments((prev) => prev.map((a) => (a.id === attachment.id ? next : a)))
    void startUpload(next)
  }

  function removeAttachment(attachment: MediaAttachment) {
    URL.revokeObjectURL(attachment.previewUrl)
    setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
  }

  function clearAttachments() {
    attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.previewUrl))
    setAttachments([])
  }

  const valid = Boolean(
    office &&
    senderName.trim() &&
    receiverName.trim() &&
    receiverPhone.trim() &&
    destName.trim()
  )

  async function submit() {
    if (isPassengerOnly) {
      toast.error('Passenger-only vehicles can review trips only and cannot create packages.')
      return
    }
    if (!valid || busy || !office) return
    if (isUploading) {
      toast.info('Photos are still uploading — please wait a moment')
      return
    }
    if (hasFailedUploads) {
      toast.error('Remove or retry the failed uploads before creating the package')
      return
    }
    setBusy(true)
    try {
      const media = attachments
        .map((a) => a.mediaId)
        .filter((id): id is string => Boolean(id))
        .map((mediaId) => ({ mediaId }))
      const result = await createPackage({
        deliveryType,
        sender: { role: 'SENDER', name: senderName.trim(), phone: senderPhone.trim() || null },
        receiver: { role: 'RECEIVER', name: receiverName.trim(), phone: receiverPhone.trim() },
        origin: { type: 'ORIGIN', latitude: originCoords[0], longitude: originCoords[1], placeName: originName.trim(), placeId: originPlaceId, officeLocationId: originOfficeLocationId },
        destination: { type: 'DESTINATION', latitude: destCoords[0], longitude: destCoords[1], placeName: destName.trim(), placeId: destPlaceId },
        details: {
          weight: weight ? num(weight) : null,
          category: category.trim() || null,
          description: description.trim() || null,
          fragile: fragile,
          media: media.length > 0 ? media : null,
        },
        transferRuleType: ruleType === 'NONE' ? null : ruleType,
        transferMatchUserId: matchDriverId ?? null,
      })
      clearAttachments()
      // Only a SECURE transfer produces a code worth revealing — NONE/AUTO
      // have nothing to show, so keep the dialog closed for those.
      if (result.secureCode) {
        setReveal({ code: result.secureCode })
      } else {
        onClose()
      }
    } catch {
      /* error toasted by the store */
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New package</DialogTitle>
            <DialogDescription>
              Log an incoming shipment. Workers must supply the sender; you automatically become the first custodian.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Sender</p>
                <Input placeholder="Name" value={senderName} onChange={(event) => setSenderName(event.target.value)} />
                <Input placeholder="Phone (optional)" value={senderPhone} onChange={(event) => setSenderPhone(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Receiver</p>
                  <span className="text-[10px] font-medium text-rose-500">* Required</span>
                </div>
                <Input
                  placeholder="Name *"
                  value={receiverName}
                  onChange={(event) => setReceiverName(event.target.value)}
                  required
                />
                <Input
                  placeholder="Phone number *"
                  type="tel"
                  value={receiverPhone}
                  onChange={(event) => setReceiverPhone(event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Origin</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    <Building2 className="size-3.5" />
                  </span>
                  <Input
                    value={office ? officeLocationName(office) : 'Loading office…'}
                    readOnly
                    disabled={!office}
                    className="pl-9 text-xs"
                  />
                </div>
                {office && (
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Lock className="size-3 shrink-0" />
                    {officeBaseName(office)} — your assigned office is always the pickup location
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Destination</p>
                <LocationSuggestionInput
                  value={destName}
                  onChange={setDestName}
                  onLocationSelect={(loc) => {
                    setDestCoords([loc.latitude, loc.longitude])
                    setDestPlaceId(loc.place_id ?? null)
                  }}
                  placeholder="Drop-off location"
                  icon={<MapPin className="size-3.5" />}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-muted-foreground">Details</p>
                <Input placeholder="Weight (kg, optional)" value={weight} onChange={(event) => setWeight(event.target.value)} />
                <Input placeholder="Category (optional)" value={category} onChange={(event) => setCategory(event.target.value)} />
              </div>
              <div className="flex flex-col gap-2 pt-6">
                <Input placeholder="Description (optional)" value={description} onChange={(event) => setDescription(event.target.value)} />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={fragile} onChange={(event) => setFragile(event.target.checked)} className="size-3.5 accent-[#f07c42]" />
                  Fragile item
                </label>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Photos &amp; videos <span className="font-normal">(optional)</span>
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDemo}
                  title={isDemo ? 'Photo uploads are disabled in demo mode' : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImagePlus className="size-3.5" />
                  Attach
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_MEDIA}
                multiple
                className="hidden"
                onChange={(event) => {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              {attachments.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isDemo}
                  title={isDemo ? 'Photo uploads are disabled in demo mode' : undefined}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ImagePlus className="size-3.5" />
                  Add condition / proof photos
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="relative aspect-square overflow-hidden rounded-xl border border-border bg-muted"
                    >
                      {attachment.file.type.startsWith('video/') ? (
                        <div className="flex size-full flex-col items-center justify-center gap-1 p-1 text-muted-foreground">
                          <Film className="size-5" />
                          <span className="line-clamp-2 text-center text-[9px] leading-tight">
                            {attachment.file.name}
                          </span>
                        </div>
                      ) : (
                        <img
                          src={attachment.previewUrl}
                          alt={attachment.file.name}
                          className="size-full object-cover"
                        />
                      )}
                      {attachment.uploading && (
                        <div className="absolute inset-0 grid place-items-center bg-black/40">
                          <Loader2 className="size-5 animate-spin text-white" />
                        </div>
                      )}
                      {!attachment.uploading && attachment.error && (
                        <button
                          type="button"
                          onClick={() => retryUpload(attachment)}
                          title={attachment.error}
                          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-rose-950/70 p-1 text-center text-[9px] font-medium text-white"
                        >
                          <RotateCcw className="size-4" />
                          Retry upload
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment)}
                        aria-label={`Remove ${attachment.file.name}`}
                        className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {isUploading && (
                <p className="text-[10px] text-muted-foreground">
                  Uploading {attachments.filter((a) => a.uploading).length} file(s)…
                </p>
              )}
              {hasFailedUploads && (
                <p className="text-[10px] text-rose-500">
                  One or more uploads failed — tap the thumbnail to retry, or remove it.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-muted-foreground">Transfer rule</p>
              <div className="grid grid-cols-2 gap-2">
                {TRANSFER_RULES.map((rule) => (
                  <button
                    key={rule.value}
                    onClick={() => {
                      setRuleType(rule.value)
                      // Clear driver selection when switching to no transfer
                      if (rule.value === 'NONE') {
                        setMatchDriverId(null)
                        setMatchDriverName(null)
                      }
                    }}
                    className={cn(
                      'rounded-xl border p-3 text-left transition-colors',
                      ruleType === rule.value ? 'border-[#1f2523] bg-[#1f2523] text-white' : 'border-border hover:bg-muted/50',
                    )}
                  >
                    <p className="text-xs font-semibold">{rule.label}</p>
                    <p className={cn('mt-1 text-[10px] leading-relaxed', ruleType === rule.value ? 'text-white/60' : 'text-muted-foreground')}>
                      {rule.hint}
                    </p>
                  </button>
                ))}
              </div>

              {ruleType !== 'NONE' && (
                <div className="mt-1">
                  <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">Assign to driver (optional)</p>
                  {matchDriverId ? (
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2">
                      <UserRound className="size-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate text-xs font-medium">{matchDriverName}</span>
                      <button
                        onClick={() => { setMatchDriverId(null); setMatchDriverName(null) }}
                        className="grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-muted"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDriverPickerOpen(true)}
                      className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border p-2.5 text-left text-xs text-muted-foreground hover:bg-muted/50"
                    >
                      <UserRound className="size-3.5" />
                      Pick a driver…
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              className="gap-2 bg-[#f07c42] text-white hover:bg-[#e3743e]"
              disabled={!valid || busy || isUploading}
              onClick={() => void submit()}
            >
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              <PackagePlus className="size-3.5" />
              Create package
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DriverPickerDialog
        open={driverPickerOpen}
        title="Select driver"
        description="Choose a driver to pick up this package. They will receive a transfer request."
        onConfirm={async (id) => {
          const driver = drivers.find((d) => d.id === id)
          setMatchDriverId(id)
          setMatchDriverName(driver ? (driver.firstName ?? driver.email) : 'Driver')
        }}
        onClose={() => setDriverPickerOpen(false)}
      />
      <CodeRevealDialog
        open={Boolean(reveal)}
        title="Secure transfer code — save this once"
        description={reveal?.code ? 'Share this code with the worker or driver who will accept the transfer. It will not be shown again.' : ''}
        code={reveal?.code ?? null}
        onClose={() => {
          setReveal(null)
          onClose()
        }}
      />
    </>
  )
}
