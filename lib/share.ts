/**
 * Public, shareable tracking link helpers.
 *
 * The code is the bearer capability — never include sender/receiver names,
 * phones, addresses or delivery codes in the WhatsApp message.
 */
export const TWESE_BASE_URL = (
  process.env.NEXT_PUBLIC_TWESE_URL || 'https://twese.gocavgo.com'
).replace(/\/+$/, '')

export function buildTrackingUrl(code: string): string {
  const cleanCode = code.trim().toUpperCase()
  return `${TWESE_BASE_URL}/track/${encodeURIComponent(cleanCode)}`
}

export function buildWhatsAppUrl(code: string, message?: string): string {
  const text = message ?? `Track this package on Twese: ${buildTrackingUrl(code)}`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}
