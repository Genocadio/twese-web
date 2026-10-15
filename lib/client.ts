// Minimal GraphQL-over-HTTP client. No external dependency:
// posts the operation to the Spring Boot GraphQL endpoint with a
// Nexxauth JWT in the Authorization header (the backend reads the
// authenticated user + role from the token).

export const API_URL: string =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') || 'http://localhost:8080'

// All GraphQL traffic goes through the gateway's /ikuriye namespace.
// The gateway strips /ikuriye and forwards /graphql to ikuriyebackend.
export const GRAPHQL_ENDPOINT = `${API_URL}/ikuriye/graphql`

// cavgotrips location search — served by the Go service through the gateway's /navig namespace.
export const LOCATIONS_URL = `${API_URL}/navig/locations`

export interface GraphqlErrorShape {
  message: string
  path?: (string | number)[]
  extensions?: Record<string, unknown>
}

export class ApiError extends Error {
  status: number
  graphqlErrors: GraphqlErrorShape[]
  code?: string

  constructor(message: string, opts: { status: number; graphqlErrors?: GraphqlErrorShape[]; code?: string }) {
    super(message)
    this.name = 'ApiError'
    this.status = opts.status
    this.graphqlErrors = opts.graphqlErrors ?? []
    this.code = opts.code
  }
}

export function isAuthError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 401) return true
  return (
    error.code === 'TOKEN_EXPIRED' ||
    error.code === 'TOKEN_INVALID' ||
    error.code === 'EXPIRED_TOKEN' ||
    error.code === 'INVALID_TOKEN' ||
    error.code === 'MALFORMED_TOKEN'
  )
}

/**
 * True when the request failed for an infrastructure/connectivity reason rather
 * than a business-logic or auth reason — the backend is unreachable, not
 * responding, blocked by CORS, or returned a 5xx. These are transient and
 * should surface as a "come back later / retry" message, NOT as a sign-in
 * failure or a role problem.
 *
 * - status 0: fetch threw (network down, connection refused, DNS, or a CORS
 *   rejection — the browser never delivered an HTTP response).
 * - status >= 500: server error / gateway timeout.
 * - ApiError with a thrown network message but no GraphQL payload.
 */
export function isInfraError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 0) return true
  if (error.status >= 500) return true
  return error.graphqlErrors.length === 0 && error.code === undefined
}

/**
 * Outcome of an auth-layer refresh attempt. `token` is the fresh access token
 * on success. `retriable` is true when the refresh failed for a transient
 * reason (network) — the session is still valid, just not refreshable right
 * now; callers must NOT treat this as a dead session.
 */
export interface AuthRefreshOutcome {
  token: string | null
  retriable: boolean
}

/**
 * Optional callback registered by the auth layer. When a request fails with an
 * expired/invalid token, `gql()` calls it to obtain a fresh token and retries
 * the request once with it. When the callback is absent (e.g. signed out) or a
 * refresh is impossible, the original auth error propagates.
 */
type AuthErrorHandler = () => Promise<AuthRefreshOutcome>
let authErrorHandler: AuthErrorHandler | null = null

export function setAuthErrorHandler(handler: AuthErrorHandler | null) {
  authErrorHandler = handler
}

export interface GqlOptions {
  query: string
  variables?: Record<string, unknown>
  token?: string | null
  signal?: AbortSignal
}

/** True when the backend rejected the request because of a bad/expired token. */
function isAuthFailure(
  response: Response,
  json: { errors?: GraphqlErrorShape[] } | null,
): boolean {
  if (response.status === 401) return true
  const first = json?.errors?.[0]
  const code = typeof first?.extensions?.code === 'string' ? first.extensions.code : undefined
  return (
    code === 'TOKEN_EXPIRED' ||
    code === 'TOKEN_INVALID' ||
    code === 'EXPIRED_TOKEN' ||
    code === 'INVALID_TOKEN' ||
    code === 'MALFORMED_TOKEN'
  )
}

export interface RestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  token?: string | null
  signal?: AbortSignal
}

export interface RestResult<T> {
  status: number
  data: T | null
}

/**
 * Minimal REST client for JSON endpoints (cavgomain via the gateway's /main
 * namespace, cavgotrips, etc.). Mirrors `gql()`'s auth behaviour: a rejected
 * JWT triggers the registered auth handler and one retry with the fresh token;
 * infrastructure failures surface as ApiError with status 0 / 5xx.
 */
export async function rest<T = unknown>(path: string, options: RestOptions = {}): Promise<RestResult<T>> {
  let retried = false

  const run = async (authToken: string | null): Promise<RestResult<T>> => {
    const headers: Record<string, string> = {}
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`

    const url = path.startsWith('http') ? path : `${API_URL}${path}`

    let response: Response
    try {
      response = await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: options.signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError(`Cannot reach the backend at ${url}. Is the Twese API running?`, { status: 0 })
    }

    let data: T | null = null
    if (response.status !== 204) {
      try {
        data = await response.json()
      } catch {
        data = null
      }
    }

    if (response.status === 401 && !retried && authErrorHandler) {
      retried = true
      const outcome = await authErrorHandler()
      if (outcome.token) return run(outcome.token)
      if (outcome.retriable) {
        throw new ApiError('Could not refresh your session — check your connection and try again.', {
          status: 0,
        })
      }
    }

    if (!response.ok) {
      const message =
        data && typeof data === 'object' && 'message' in data && typeof (data as { message?: unknown }).message === 'string'
          ? (data as { message: string }).message
          : `Request failed (HTTP ${response.status})`
      throw new ApiError(message, { status: response.status })
    }

    return { status: response.status, data }
  }

  return run(options.token ?? null)
}

export async function gql<T>({ query, variables, token, signal }: GqlOptions): Promise<T> {
  // Refresh-on-401: when the backend rejects the token, the registered auth
  // handler refreshes it via Nexxauth and the request is retried once
  // with the fresh token. Only a truly dead session (refresh rejected) reaches
  // the caller as an auth error.
  let retried = false

  const run = async (authToken: string | null): Promise<T> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`

    let response: Response
    try {
      response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query, variables: variables ?? {} }),
        signal,
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      throw new ApiError(
        `Cannot reach the backend at ${GRAPHQL_ENDPOINT}. Is the Twese API running?`,
        { status: 0 },
      )
    }

    let json: { data?: unknown; errors?: GraphqlErrorShape[] } | null = null
    try {
      json = await response.json()
    } catch {
      throw new ApiError(`Backend returned HTTP ${response.status} with an unparseable body`, {
        status: response.status,
      })
    }

    if (isAuthFailure(response, json) && !retried && authErrorHandler) {
      const first = json?.errors?.[0]
      const code = typeof first?.extensions?.code === 'string' ? first.extensions.code : undefined
      console.debug(
        '[auth] gql: auth failure detected — status=', response.status,
        '| code=', code ?? '(none)',
        '| retrying with refresh...',
      )
      retried = true
      const outcome = await authErrorHandler()
      if (outcome.token) {
        console.debug('[auth] gql: refresh succeeded — retrying request')
        // Refresh succeeded — retry once with the fresh token.
        return run(outcome.token)
      }
      if (outcome.retriable) {
        console.debug('[auth] gql: refresh retriable (network) — returning stale data if available')
        // Transient failure (network): keep the session, don't look signed-out.
        // Return any partial data the backend may have sent before the auth error,
        // so the UI stays functional rather than showing a login screen.
        if (json?.data) return json.data as T
        throw new ApiError('Could not refresh your session — check your connection and try again.', {
          status: 0,
        })
      }
      console.debug('[auth] gql: refresh rejected — session is dead')
      // Refresh impossible/rejected — fall through and surface the auth error
      // so the caller can sign the user out.
    }

    if (json && Array.isArray(json.errors) && json.errors.length > 0) {
      const first = json.errors[0]
      throw new ApiError(first.message, {
        status: response.status,
        graphqlErrors: json.errors,
        code: typeof first.extensions?.code === 'string' ? first.extensions.code : undefined,
      })
    }

    if (!response.ok) {
      throw new ApiError(`Backend responded with HTTP ${response.status}`, { status: response.status })
    }

    return (json?.data ?? {}) as T
  }

  return run(token ?? null)
}
