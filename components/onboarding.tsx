'use client'

import Image from 'next/image'
import { useCallback, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  MapPin,
  RefreshCcw,
} from 'lucide-react'
import { isAuthError } from '@/lib/client'
import * as api from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useOnboarding, type OnboardingState } from '@/lib/onboarding'
import type { CompanyOffice, CompanyPreview, User } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface GateProps {
  children: React.ReactNode
}

/**
 * The workspace renders immediately for any signed-in (non-denied) user — the
 * membership check runs silently in the background and only reroutes those who
 * actually need it: workers without an office land on the office picker,
 * non-members on the company request screen. Users who already completed the
 * steps never see them.
 */
export function OnboardingGate({ children }: GateProps) {
  const { token, user, logout, handleSessionExpired, canRefresh, refreshSession } = useAuth()
  const roleRefreshFired = useRef(false)

  // After the membership check confirms the user belongs to a company, re-issue
  // the token once if its role hasn't caught up with Nexxauth (e.g. CUSTOMER
  // still, but approved as WORKER). The fresh token carries the new role so the
  // ikuriye workspace role checks (hasAnyRole('WORKER','DRIVER')) pass.
  const onRoleRefreshNeeded = useCallback(() => {
    if (roleRefreshFired.current || !canRefresh) return
    roleRefreshFired.current = true
    void refreshSession().then((outcome) => {
      if (!outcome.token) roleRefreshFired.current = false
    })
  }, [canRefresh, refreshSession])

  const onboarding = useOnboarding(token, handleSessionExpired, user?.role ?? null, onRoleRefreshNeeded)

  if (onboarding.phase === 'member') return <>{children}</>

  return (
    <OnboardingShell user={user} logout={logout}>
      {onboarding.phase === 'join' && <JoinCompanyScreen onboarding={onboarding} token={token} />}
      {onboarding.phase === 'waiting' && <WaitingApprovalScreen onboarding={onboarding} />}
      {onboarding.phase === 'office' && <PickOfficeScreen onboarding={onboarding} />}
    </OnboardingShell>
  )
}

function OnboardingShell({
  user,
  logout,
  children,
}: {
  user: User | null
  logout: () => void
  children: React.ReactNode
}) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo.png" width={72} height={72} alt="Twese" className="size-16 object-contain drop-shadow-md" priority />
          <p className="mt-4 font-mono text-xl font-bold tracking-tight">TWESE</p>
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">Worker console</p>
          {user && (
            <p className="mt-3 text-xs text-muted-foreground">
              Signed in as <span className="font-semibold text-foreground">{user.email}</span>
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">{children}</div>

        <div className="mt-6 flex justify-center">
          <Button variant="outline" className="h-9 gap-2 text-xs" onClick={logout}>
            <LogOut className="size-3.5" /> Log out
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Step 1: join a company with its access code ─────────────────────────────

function JoinCompanyScreen({
  onboarding,
  token,
}: {
  onboarding: OnboardingState & { requestAccess: (code: string) => Promise<boolean> }
  token: string | null
}) {
  const [step, setStep] = useState<'code' | 'confirm'>(onboarding.pendingAccess?.status === 'REJECTED' ? 'code' : 'code')
  const [code, setCode] = useState(onboarding.pendingAccess?.status === 'REJECTED' ? '' : '')
  const [preview, setPreview] = useState<CompanyPreview | null>(
    (onboarding.pendingAccess?.companyName && onboarding.pendingAccess.companyId
      ? {
          id: onboarding.pendingAccess.companyId,
          companyName: onboarding.pendingAccess.companyName,
        }
      : null) ?? null,
  )
  const [validationError, setValidationError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const rejected = onboarding.pendingAccess?.status === 'REJECTED'

  async function validate() {
    if (!token || !code.trim()) return
    setChecking(true)
    setValidationError(null)
    try {
      const company = await api.fetchCompanyByCode(token, code.trim())
      if (!company) {
        setValidationError('We couldn’t find a company with that code.')
        return
      }
      setPreview(company)
      setStep('confirm')
    } catch (error) {
      if (isAuthError(error)) {
        setValidationError('Your session expired. Sign in again to continue.')
        return
      }
      const message = error instanceof Error ? error.message : 'Something went wrong.'
      setValidationError(message.includes('404') ? 'We couldn’t find a company with that code.' : message)
    } finally {
      setChecking(false)
    }
  }

  function resetCode() {
    setStep('code')
    setPreview(null)
    setCode('')
    setValidationError(null)
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-[#f07c42]/10 text-[#f07c42]">
          <Building2 className="size-4" />
        </span>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Join your company</h1>
          <p className="text-[11px] text-muted-foreground">Enter the access code from your company.</p>
        </div>
      </div>

      {rejected && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Your earlier request was declined.{' '}
            {onboarding.pendingAccess?.rejectionReason
              ? `Reason: “${onboarding.pendingAccess.rejectionReason}”.`
              : ''}{' '}
            You can submit a new request below.
          </span>
        </div>
      )}

      {onboarding.error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{onboarding.error}</span>
        </div>
      )}

      {step === 'code' && (
        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            void validate()
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Company access code</span>
            <Input
              required
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="e.g. TWESE-001"
              className="h-10 font-mono text-sm uppercase"
              autoFocus
              disabled={checking}
            />
          </label>
          {validationError && (
            <p className="text-[11px] leading-relaxed text-red-600">{validationError}</p>
          )}
          <Button
            type="submit"
            disabled={checking || !code.trim()}
            className="mt-1 h-10 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
          >
            {checking ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
            {checking ? 'Checking…' : 'Continue'}
          </Button>
          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            A staff member at the company must approve your request before you can use the workspace.
          </p>
        </form>
      )}

      {step === 'confirm' && preview && (
        <div className="mt-5 flex flex-col gap-3">
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#1f2523] text-[#d9e4dc]">
                <Building2 className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium leading-tight">{preview.companyName}</p>
                {(preview.address || preview.city) && (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <MapPin className="size-3 shrink-0" />
                    <span className="truncate">{[preview.address, preview.city].filter(Boolean).join(', ')}</span>
                  </p>
                )}
                <Badge variant="outline" className="mt-2 font-mono text-[9px] uppercase tracking-wider">
                  {code}
                </Badge>
              </div>
            </div>
          </div>
          <Button
            disabled={onboarding.busy}
            onClick={() => void onboarding.requestAccess(code)}
            className="h-10 w-full gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
          >
            {onboarding.busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {onboarding.busy ? 'Submitting…' : 'Request access'}
          </Button>
          <Button variant="ghost" className="h-9 w-full gap-1.5 text-xs" onClick={resetCode}>
            <ArrowLeft className="size-3.5" /> Enter a different code
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Step 2: request is pending staff approval ───────────────────────────────

function WaitingApprovalScreen({
  onboarding,
}: {
  onboarding: OnboardingState & { refresh: () => Promise<void> }
}) {
  const companyName = onboarding.pendingAccess?.companyName
  return (
    <div className="flex flex-col items-center py-2 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-[#f07c42]/10 text-[#f07c42]">
        <Clock className="size-6" />
      </span>
      <h1 className="mt-4 text-base font-semibold">Awaiting approval</h1>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
        {companyName ? (
          <>
            Your request to join <span className="font-semibold text-foreground">{companyName}</span> is pending.
          </>
        ) : (
          <>Your request to join the company is pending approval.</>
        )}{' '}
        A staff member needs to approve it before you can access the workspace.
      </p>

      <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        <span>Checking every {Math.round(20_000 / 1000)} seconds…</span>
      </div>

      <button
        className="mt-5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
        onClick={() => void onboarding.refresh()}
      >
        <RefreshCcw className="size-3" /> Check now
      </button>
    </div>
  )
}

// ── Step 3: approved — pick your office ─────────────────────────────────────

function PickOfficeScreen({
  onboarding,
}: {
  onboarding: OnboardingState & { pickOffice: (officeId: string) => Promise<boolean> }
}) {
  const name = (office: CompanyOffice) =>
    office.name ?? office.companyName ?? 'Office'

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="size-4" />
        </span>
        <div>
          <h1 className="text-sm font-semibold leading-tight">You’re in! Choose your office</h1>
          <p className="text-[11px] text-muted-foreground">
            {onboarding.company?.companyName ?? 'Your company'} approved you as a{' '}
            <span className="font-mono font-semibold">{onboarding.company?.role ?? 'worker'}</span>.
          </p>
        </div>
      </div>

      {onboarding.error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>{onboarding.error}</span>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-2">
        {onboarding.officesLoading && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        )}

        {!onboarding.officesLoading && onboarding.offices.length === 0 && (
          <div className="rounded-xl border border-border bg-muted/40 p-5 text-center">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {onboarding.error ? 'Loading the offices failed.' : 'No offices are set up for this company yet.'}
            </p>
          </div>
        )}

        {onboarding.offices.map((office) => (
          <button
            key={office.id}
            disabled={onboarding.busy}
            onClick={() => void onboarding.pickOffice(office.id)}
            className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition hover:border-foreground/20 hover:bg-muted/60 disabled:opacity-60"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#d9e4dc] text-[#31403a]">
              <MapPin className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{name(office)}</span>
              {(office.address || office.city) && (
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {[office.address, office.city].filter(Boolean).join(', ')}
                </span>
              )}
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
          </button>
        ))}

        {onboarding.busy && (
          <p className="py-2 text-center text-xs text-muted-foreground">Assigning your office…</p>
        )}
      </div>
    </div>
  )
}