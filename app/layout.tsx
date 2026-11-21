import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_TWESE_URL || 'https://twese.gocavgo.com'),
  title: 'Twese Worker Console',
  description: 'A focused package custody workspace for intake, handoffs, and route progress.',
  icons: {
    icon: [
      {
        url: '/favicon.ico?v=2',
        sizes: 'any',
      },
      {
        url: '/icon-light-32x32.png?v=2',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        url: '/icon.png?v=2',
        type: 'image/png',
        sizes: '192x192',
      },
    ],
    apple: [
      {
        url: '/apple-icon.png?v=2',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.ico?v=2',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
