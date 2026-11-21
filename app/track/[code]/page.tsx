import type { Metadata } from 'next'
import { TrackingView } from '@/components/public/tracking-view'

function normalizeCode(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toUpperCase()
  } catch {
    return raw.trim().toUpperCase()
  }
}

type PageProps = {
  params: Promise<{ code: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { code } = await params
  const cleanCode = normalizeCode(code)
  const title = cleanCode ? `Track ${cleanCode} | Twese` : 'Track a Package | Twese'
  const description = 'Check the latest delivery status and route progress for this Twese package.'

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `/track/${encodeURIComponent(cleanCode)}`,
      siteName: 'Twese Tracking',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default async function TrackCodePage({ params }: PageProps) {
  const { code } = await params
  return <TrackingView initialCode={normalizeCode(code)} />
}
