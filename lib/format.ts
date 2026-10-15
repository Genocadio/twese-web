// Small formatting helpers used across the workspace UI.

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const diff = Date.now() - then
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  const name = [first, last].filter(Boolean).join(' ').trim()
  return name || 'Twese user'
}

export function displayName(user: { firstName: string | null; lastName: string | null; email: string; username: string | null }): string {
  const name = fullName(user.firstName, user.lastName)
  if (name !== 'Twese user') return name
  return user.email.split('@')[0] || user.username || user.email
}

export function weightLabel(weightKg: number | null | undefined): string | null {
  if (weightKg == null) return null
  return `${Number(weightKg.toFixed(2))} kg`
}


