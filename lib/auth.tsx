'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { isAuthError, isInfraError, setAuthErrorHandler, type AuthRefreshOutcome } from './client'
import { fetchProfile } from './api'
import type { Role, User } from './types'

const SESSION_KEY = 'twese.session'
const USER_KEY = 'twese.user'

/**
 * Roles that are NOT allowed in the worker portal. Staff/admins manage
 * workers through their own consoles; everyone else (including CUSTOMER — who
 * can join a company through the portal) may sign in and go through the
 * company onboarding flow, which grants the WORKER role on approval.
 */
export const DENIED_PORTAL_ROLES: ReadonlyArray<string> = ['SUPER_ADMIN', 'ADMIN', 'FLEET_MANAGER', 'SUPERVISOR']

const NEXXAUTH_BASE_URL: string = process.env.NEXT_PUBLIC_NEXXAUTH_BASE_URL?.replace(/\/+$/, '') || ''
const NEXXAUTH_CLIENT_ID: string = process.env.NEXT_PUBLIC_NEXXAUTH_CLIENT_ID || ''

// Refresh when fewer than 5 minutes remain before the JWT expires — matches the
// Android app's PROACTIVE_REFRESH_THRESHOLD_SECONDS in NexxAuth.observeSession.
const REFRESH_THRESHOLD_SECONDS = 5 * 60
// Safety-net re-check interval when the token expiry can't be determined.
const REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000  /** Persisted session. */
interface PersistedSession {
  access: string
  refresh: string | null
  /** Unix seconds when the access token expires. */
  exp: number | null
}

interface NexxAuthOrgUser {
  id: number
  firstName: string
  lastName?: string
  username?: string
  email?: string
  phone?: string
  enabled: boolean
  roles: string[]
  authTypes: string[]
  createdAt?: string
}

interface NexxAuthResponse {
  accessToken: string
  refreshToken: string | null
  tokenType: string
  expiresInSeconds: number
  user: NexxAuthOrgUser
  actions: string[]
}

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn' | 'denied' | 'unreachable'

export interface AuthState {
  status: AuthStatus
  token: string | null
  user: User | null
  error: string | null
  nexxauthConfigured: boolean
  /** True when a refresh token is persisted (password login) — auto-refresh is possible. */
  canRefresh: boolean
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  handleSessionExpired: () => void
  /** Re-run bootstrap after an infrastructure failure (backend was unreachable). */
  retryBootstrap: () => Promise<void>
  /** Refresh the access token via Nexxauth. `{ token }` on success,
   *  `{ token: null, retriable: true }` on transient network failure (session
   *  kept), `{ token: null, retriable: false }` when the refresh token was
   *  rejected/revoked (session cleared, user signed out). */
  refreshSession: () => Promise<AuthRefreshOutcome>
}

interface AuthContextValue extends AuthState, AuthActions {}

const AuthContext = createContext<AuthContextValue | null>(null)

// ── Session persistence ──────────────────────────────────────────────────────

function readStored(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(SESSION_KEY) ?? localStorage.getItem('cavgo.session')
  } catch {
    return null
  }
}

function writeStored(value: string) {
  try {
    localStorage.setItem(SESSION_KEY, value)
  } catch {
    /* storage unavailable */
  }
}

function clearStored() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

/** Parse the persisted session. Legacy bare-JWT values (no refresh token) are
 *  still understood so existing sessions keep working after this upgrade. */
function parseSession(): PersistedSession | null {
  const raw = readStored()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as PersistedSession
    if (parsed && typeof parsed.access === 'string' && parsed.access) {
      return {
        access: parsed.access,
        refresh: typeof parsed.refresh === 'string' ? parsed.refresh : null,
        exp: typeof parsed.exp === 'number' ? parsed.exp : null,
      }
    }
  } catch {
    /* not JSON — legacy storage */
  }
  return { access: raw, refresh: null, exp: null }
}

function persistSession(session: PersistedSession) {
  writeStored(JSON.stringify(session))
}

/** Persist the user profile from the Nexxauth login/refresh response. */
function persistUser(user: User) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    /* storage unavailable */
  }
}

/** Read the cached user profile. */
function readStoredUser(): User | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

function clearStoredUser() {
  try {
    localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore */
  }
}

/** Decode the JWT payload to read the `exp` claim (Unix seconds). */
function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

// ── Nexxauth HTTP helpers ────────────────────────────────────────────────────

function nexxauthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (NEXXAUTH_CLIENT_ID) headers['X-Client-Id'] = NEXXAUTH_CLIENT_ID
  if (typeof window !== 'undefined' && window.location?.origin) {
    headers['Origin'] = window.location.origin
  }
  return headers
}

async function nexxauthPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${NEXXAUTH_BASE_URL}${path}`, {
      method: 'POST',
      headers: nexxauthHeaders(),
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(
      "We couldn't reach the sign-in service. Check your connection and try again — if this keeps happening, the service may be temporarily unavailable.",
    )
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    message?: string
    error?: string
  }
  if (!res.ok) {
    if (res.status >= 500) {
      throw new Error('The sign-in service is temporarily unavailable. Please try again shortly.')
    }
    throw new Error(json.message || json.error || `Nexxauth request failed (HTTP ${res.status})`)
  }
  return json as T
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    token: null,
    user: null,
    error: null,
    nexxauthConfigured: Boolean(NEXXAUTH_BASE_URL && NEXXAUTH_CLIENT_ID),
    canRefresh: false,
  })
  const bootstrapping = useRef(false)
  const refreshInFlight = useRef<Promise<AuthRefreshOutcome> | null>(null)

  const bootstrap = useCallback(async (token: string) => {
    if (bootstrapping.current) return
    bootstrapping.current = true
    try {
      // Fetch the profile — the backend auto-syncs from Nexxauth when
      // the JWT's dataHash doesn't match the stored value.
      const { myProfile } = await fetchProfile(token)
      setState((prev) => ({
        ...prev,
        status: 'signedIn',
        token,
        user: myProfile,
        error: null,
      }))
    } catch (error) {
      if (isAuthError(error)) {
        // The token was rejected — the session is genuinely dead.
        clearStored()
        setState((prev) => ({ ...prev, status: 'signedOut', token: null, user: null, error: null, canRefresh: false }))
      } else if (isInfraError(error)) {
        // Backend unreachable / CORS / 5xx — a connectivity problem, NOT a role
        // or auth problem. Keep the stored session so a retry can pick up where
        // we left off, but surface a "come back later" state instead of
        // misleadingly appearing signed in with no role.
        setState((prev) => ({
          ...prev,
          status: 'unreachable',
          token,
          user: null,
          canRefresh: Boolean(parseSession()?.refresh),
          error: error instanceof Error ? error.message : "We couldn't reach the Twese service.",
        }))
      } else {
        // Any other failure while establishing the session (e.g. a 4xx GraphQL
        // error) still leaves us without a usable profile. Surface a retryable
        // state rather than a half-broken "signed in" shell with no user.
        setState((prev) => ({
          ...prev,
          status: 'unreachable',
          token,
          user: null,
          canRefresh: Boolean(parseSession()?.refresh),
          error: error instanceof Error ? error.message : "We couldn't load your profile.",
        }))
      }
    } finally {
      bootstrapping.current = false
    }
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      setState((prev) => ({ ...prev, error: null }))
      if (!NEXXAUTH_BASE_URL || !NEXXAUTH_CLIENT_ID) {
        const message =
          'Nexxauth is not configured on this frontend. Add NEXT_PUBLIC_NEXXAUTH_BASE_URL and NEXT_PUBLIC_NEXXAUTH_CLIENT_ID.'
        setState((prev) => ({ ...prev, error: message }))
        throw new Error(message)
      }
      let data: NexxAuthResponse
      try {
        data = await nexxauthPost<NexxAuthResponse>('/auth/login', {
          identifier: email.trim(),
          identifierType: 'EMAIL',
          authType: 'PASSWORD',
          password,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sign-in failed'
        setState((prev) => ({ ...prev, error: message }))
        throw error
      }
      const session = {
        access: data.accessToken,
        refresh: data.refreshToken,
        exp:
          typeof data.expiresInSeconds === 'number'
            ? Math.floor(Date.now() / 1000 + data.expiresInSeconds)
            : null,
      }
      persistSession(session)
      console.debug(
        '[auth] login success:',
        'expiresIn=', data.expiresInSeconds + 's',
        '| exp=', session.exp ? new Date(session.exp * 1000).toISOString() : 'unknown',
        '| hasRefreshToken=', Boolean(session.refresh),
        '| user=', data.user.id,
      )
      setState((prev) => ({ ...prev, canRefresh: Boolean(session.refresh) }))
      // Nexxauth response includes the full user object with roles —
      // use it directly for UI routing instead of fetching from backend.
      const user: User = {
        id: String(data.user.id),
        email: data.user.email ?? '',
        phone: data.user.phone ?? null,
        firstName: data.user.firstName ?? null,
        lastName: data.user.lastName ?? null,
        username: data.user.username ?? null,
        role: data.user.roles?.[0]?.toUpperCase()?.replace('-', '_') as Role ?? 'CUSTOMER',
        status: data.user.enabled ? 'ACTIVE' : 'DISABLED',
        createdAt: data.user.createdAt ?? new Date().toISOString(),
        updatedAt: data.user.createdAt ?? new Date().toISOString(),
      }
      persistUser(user)
      setState((prev) => ({
        ...prev,
        status: 'signedIn',
        token: data.accessToken,
        user,
        error: null,
      }))
    },
    [],
  )

  const logout = useCallback(async () => {
    console.debug('[auth] logout requested')
    const session = parseSession()
    if (session?.refresh && NEXXAUTH_BASE_URL) {
      try {
        await fetch(`${NEXXAUTH_BASE_URL}/auth/logout`, {
          method: 'POST',
          headers: nexxauthHeaders(),
          body: JSON.stringify({ refreshToken: session.refresh }),
        })
        console.debug('[auth] logout: server-side logout succeeded')
      } catch {
        console.debug('[auth] logout: server-side logout failed (best-effort)')
      }
    }
    clearStored()
    clearStoredUser()
    setState((prev) => ({ ...prev, status: 'signedOut', token: null, user: null, error: null, canRefresh: false }))
    console.debug('[auth] logout: session cleared')
  }, [])

  const handleSessionExpired = useCallback(() => {
    if (state.status !== 'signedIn') return
    console.warn('[auth] session expired — clearing stored session')
    clearStored()
    clearStoredUser()
    setState((prev) => ({
      ...prev,
      status: 'signedOut',
      token: null,
      user: null,
      canRefresh: false,
      error: 'Your session expired. Please sign in again.',
    }))
  }, [state.status])

  // Single-flight refresh. On success the new access token (and any rotated
  // refresh token) is persisted and exposed; the caller gets the fresh token.
  const refreshSession = useCallback(async (): Promise<AuthRefreshOutcome> => {
    if (refreshInFlight.current) {
      console.debug('[auth] refreshSession: dedup — refresh already in flight')
      return refreshInFlight.current
    }
    const run = async (): Promise<AuthRefreshOutcome> => {
      const session = parseSession()
      if (!session?.refresh || !NEXXAUTH_BASE_URL) {
        console.debug('[auth] refreshSession: no refresh token or no nexxauth URL — cannot refresh')
        return { token: null, retriable: false }
      }
      const remaining = session.exp ? Math.round(session.exp - Date.now() / 1000) : 'unknown'
      console.debug('[auth] refreshSession: calling /auth/refresh, token expires in', remaining + 's')
      let response: Response
      try {
        response = await fetch(`${NEXXAUTH_BASE_URL}/auth/refresh`, {
          method: 'POST',
          headers: nexxauthHeaders(),
          body: JSON.stringify({ refreshToken: session.refresh }),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // CORS errors show as TypeError with 'Failed to fetch' or 'NetworkError'
        const isCors = msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('CORS')
        console.warn(
          '[auth] refreshSession:', isCors ? 'CORS/network error' : 'network error',
          '—', msg,
          isCors ? '\n  → The Nexxauth server may be missing your frontend origin in its CORS allowed list.' : '',
        )
        return { token: null, retriable: true }
      }
      let json: NexxAuthResponse & { message?: string; error?: string }
      try {
        json = (await response.json()) as NexxAuthResponse & { message?: string; error?: string }
      } catch {
        console.warn('[auth] refreshSession: failed to parse response body')
        return { token: null, retriable: true }
      }
      if (!response.ok || !json.accessToken) {
        console.warn(
          '[auth] refreshSession: FAILED — status=', response.status,
          '| message=', json.message ?? json.error ?? '(none)',
          '| hasAccessToken=', Boolean(json.accessToken),
          '| session will be cleared',
        )
        clearStored()
        setState((prev) => ({
          ...prev,
          status: 'signedOut',
          token: null,
          user: null,
          canRefresh: false,
          error: 'Your session expired. Please sign in again.',
        }))
        return { token: null, retriable: false }
      }
      const next: PersistedSession = {
        access: json.accessToken,
        // Nexxauth rotates refresh tokens — use the new one if provided, otherwise
        // keep the current one (null means a gating action is pending).
        refresh: json.refreshToken ?? session.refresh,
        exp:
          typeof json.expiresInSeconds === 'number'
            ? Math.floor(Date.now() / 1000 + json.expiresInSeconds)
            : null,
      }
      persistSession(next)
      const newRemaining = next.exp ? Math.round(next.exp - Date.now() / 1000) : 'unknown'
      console.debug(
        '[auth] refreshSession: OK — new token expires in', newRemaining + 's',
        '| rotatedRefreshToken=', json.refreshToken != null,
      )
      // Nexxauth refresh response also includes the full user — update cached data
      if (json.user) {
        const user: User = {
          id: String(json.user.id),
          email: json.user.email ?? '',
          phone: json.user.phone ?? null,
          firstName: json.user.firstName ?? null,
          lastName: json.user.lastName ?? null,
          username: json.user.username ?? null,
          role: json.user.roles?.[0]?.toUpperCase()?.replace('-', '_') as Role ?? 'CUSTOMER',
          status: json.user.enabled ? 'ACTIVE' : 'DISABLED',
          createdAt: json.user.createdAt ?? new Date().toISOString(),
          updatedAt: json.user.createdAt ?? new Date().toISOString(),
        }
        persistUser(user)
        setState((prev) => ({ ...prev, token: next.access, user, canRefresh: Boolean(next.refresh) }))
      } else {
        setState((prev) => ({ ...prev, token: next.access, canRefresh: Boolean(next.refresh) }))
      }
      return { token: next.access, retriable: false }
    }
    const promise = run()
    refreshInFlight.current = promise
    try {
      return await promise
    } finally {
      refreshInFlight.current = null
    }
  }, [])

  const retryBootstrap = useCallback(async () => {
    const stored = parseSession()
    if (!stored) return
    setState((prev) => ({ ...prev, status: 'loading', error: null }))
    const exp = stored.exp ?? decodeJwtExp(stored.access)
    if (stored.refresh && (exp == null || exp <= Date.now() / 1000)) {
      const outcome = await refreshSession()
      if (outcome.token) {
        await bootstrap(outcome.token)
      } else if (outcome.retriable) {
        await bootstrap(stored.access)
      }
      // rejected → refreshSession already signed the user out
      return
    }
    await bootstrap(stored.access)
  }, [bootstrap, refreshSession])

  // Restore session on mount. If the user profile is cached from a previous
  // login, use it directly — no backend call needed. If the access token
  // expired while the tab was closed, refresh it first.
  useEffect(() => {
    const stored = parseSession()
    if (!stored) {
      console.debug('[auth] mount: no stored session — signed out')
      setState((prev) => ({ ...prev, status: 'signedOut' }))
      return
    }
    const cachedUser = readStoredUser()
    const exp = stored.exp ?? decodeJwtExp(stored.access)
    const remaining = exp != null ? Math.round(exp - Date.now() / 1000) : 'unknown'
    console.debug(
      '[auth] mount: found stored session — token expires in', remaining + 's',
      '| hasRefreshToken=', Boolean(stored.refresh),
      '| hasCachedUser=', Boolean(cachedUser),
    )
    setState((prev) => ({
      ...prev,
      token: stored.access,
      user: cachedUser,
      canRefresh: Boolean(stored.refresh),
      status: cachedUser ? 'signedIn' : 'loading',
    }))
    if (stored.refresh && (exp == null || exp <= Date.now() / 1000)) {
      console.debug('[auth] mount: token expired — attempting refresh before bootstrap')
      // Token expired — refresh first, then use cached user or bootstrap.
      void refreshSession().then((outcome) => {
        if (outcome.token) {
          console.debug('[auth] mount: refresh succeeded — using new token')
          // Refresh succeeded — update token, keep cached user if available.
          if (cachedUser) {
            setState((prev) => ({ ...prev, token: outcome.token, status: 'signedIn' }))
          } else {
            void bootstrap(outcome.token)
          }
        } else if (outcome.retriable) {
          console.debug('[auth] mount: refresh retriable (network) — using cached token')
          // Network blip — keep cached user if available, otherwise bootstrap.
          if (!cachedUser) void bootstrap(stored.access)
          else setState((prev) => ({ ...prev, status: 'signedIn' }))
        } else {
          console.debug('[auth] mount: refresh rejected — session already cleared')
        }
        // rejected → refreshSession already cleared the session and signed out
      })
      return
    }
    // Token still valid — if we have cached user, we're done. Otherwise bootstrap.
    if (cachedUser) {
      console.debug('[auth] mount: token valid + cached user — ready')
      setState((prev) => ({ ...prev, status: 'signedIn' }))
    } else {
      console.debug('[auth] mount: token valid but no cached user — bootstrapping')
      void bootstrap(stored.access)
    }
  }, [bootstrap, refreshSession])

  // Let the GraphQL client refresh transparently when a request 401s.
  // Registered whenever a token is present (including during restore/bootstrap)
  // so even the very first syncUser/myProfile calls can refresh an expired
  // token instead of bouncing the worker to the login screen.
  useEffect(() => {
    if (state.token) {
      setAuthErrorHandler(refreshSession)
    } else {
      setAuthErrorHandler(null)
    }
    return () => setAuthErrorHandler(null)
  }, [state.token, refreshSession])

  // Proactive refresh — mirrors Android NexxAuth.observeSession: refresh about
  // 5 minutes before the JWT expires, with a 5-minute safety-net interval when
  // the expiry can't be read. Only runs when a refresh token is available.
  useEffect(() => {
    if (state.status !== 'signedIn' || !state.token || !state.canRefresh) return
    const token = state.token
    let cancelled = false
    let timer: number | undefined

    console.debug('[auth] proactive refresh: timer started')

    const tick = async () => {
      if (cancelled) return
      const session = parseSession()
      const exp = session?.exp ?? decodeJwtExp(token)
      const now = Date.now() / 1000
      let delayMs: number
      if (exp != null) {
        const remaining = exp - now
        if (remaining < REFRESH_THRESHOLD_SECONDS) {
          console.debug('[auth] proactive refresh: firing — token expires in', Math.round(remaining) + 's')
          const outcome = await refreshSession()
          if (cancelled) return
          console.debug('[auth] proactive refresh: outcome=', outcome.token ? 'OK' : (outcome.retriable ? 'retriable' : 'rejected'))
          // Always reschedule — success re-checks against the new token (the
          // effect also re-runs on token change), retriable retries later, and
          // a revoked refresh signs the user out (the effect cleans up).
          timer = window.setTimeout(() => void tick(), REFRESH_CHECK_INTERVAL_MS)
          return
        }
        delayMs = Math.min(
          Math.max((remaining - REFRESH_THRESHOLD_SECONDS) * 1000, 15_000),
          REFRESH_CHECK_INTERVAL_MS,
        )
        console.debug('[auth] proactive refresh: next check in', Math.round(delayMs / 1000) + 's (token expires in', Math.round(remaining) + 's)')
      } else {
        delayMs = REFRESH_CHECK_INTERVAL_MS
        console.debug('[auth] proactive refresh: exp unknown — safety-net check in', Math.round(delayMs / 1000) + 's')
      }
      timer = window.setTimeout(() => void tick(), delayMs)
    }

    void tick()
    return () => {
      cancelled = true
      if (timer) window.clearTimeout(timer)
      console.debug('[auth] proactive refresh: timer stopped')
    }
  }, [state.status, state.token, state.canRefresh, refreshSession])

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, logout, handleSessionExpired, refreshSession, retryBootstrap }),
    [state, login, logout, handleSessionExpired, refreshSession, retryBootstrap],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
