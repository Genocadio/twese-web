'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { TrackingView } from '@/components/public/tracking-view'

function TrackContent() {
  const searchParams = useSearchParams()
  return <TrackingView initialCode={searchParams.get('code') || ''} />
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
