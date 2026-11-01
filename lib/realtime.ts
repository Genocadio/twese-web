// Minimal `graphql-transport-ws` client for Spring GraphQL subscriptions.
// No external dependency — plain WebSocket. Best-effort: callers should treat
// failures as non-fatal and fall back to polling.

import { GRAPHQL_ENDPOINT } from './client'

export function subscriptionUrl(): string {
  if (typeof window === 'undefined') return ''
  return GRAPHQL_ENDPOINT.replace(/^http/, 'ws')
}

export interface SubscriptionOptions<T> {
  token: string
  query: string
  variables?: Record<string, unknown>
  onNext: (data: T) => void
  onError?: (error: string) => void
  onComplete?: () => void
}

export function subscribeGraphql<T>(opts: SubscriptionOptions<T>): () => void {
  if (opts.token === 'demo-token') {
    return () => {}
  }
  let ws: WebSocket | null = null
  let closed = false
  const operationId = `s${Math.random().toString(36).slice(2)}`

  try {
    ws = new WebSocket(subscriptionUrl(), 'graphql-transport-ws')
  } catch {
    opts.onError?.('WebSocket not supported')
    return () => {}
  }

  const send = (message: Record<string, unknown>) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  ws.onopen = () => {
    // Authenticate the connection with the same JWT the REST layer uses.
    send({ type: 'connection_init', payload: { Authorization: `Bearer ${opts.token}` } })
  }

  ws.onmessage = (event) => {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(String(event.data))
    } catch {
      return
    }
    switch (message.type) {
      case 'connection_ack':
        send({ id: operationId, type: 'subscribe', payload: { query: opts.query, variables: opts.variables ?? {} } })
        break
      case 'next': {
        const data = (message.payload as { data?: T })?.data
        if (data) opts.onNext(data)
        break
      }
      case 'error':
        opts.onError?.(String((message.payload as { message?: string })?.message ?? 'subscription error'))
        break
      case 'complete':
        opts.onComplete?.()
        close()
        break
      case 'ping':
        send({ type: 'pong' })
        break
      case 'connection_error':
        opts.onError?.(String((message.payload as { message?: string })?.message ?? 'connection rejected'))
        close()
        break
      default:
        break
    }
  }

  ws.onerror = () => {
    opts.onError?.('websocket error')
  }

  ws.onclose = () => {
    if (!closed) opts.onError?.('connection closed')
  }

  function close() {
    if (closed) return
    closed = true
    try {
      send({ id: operationId, type: 'complete' })
    } catch {
      /* ignore */
    }
    try {
      ws?.close()
    } catch {
      /* ignore */
    }
  }

  return close
}
