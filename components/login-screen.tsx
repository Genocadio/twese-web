'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertCircle, Loader2, Lock, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'

export function LoginScreen() {
  const { login, error } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await login(email, password)
    } catch {
      /* error surfaced via auth state */
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image src="/logo.png" width={72} height={72} alt="Twese" className="size-16 object-contain drop-shadow-md" priority />
          <p className="mt-4 font-mono text-xl font-bold tracking-tight">TWESE</p>
          <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">Package Delivery &amp; Tracking</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-relaxed text-red-700">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submitPassword} className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Email</span>
              <Input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.example"
                className="h-12 text-base"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted-foreground">Password</span>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="h-12 pl-11 text-base"
                />
              </div>
            </label>
            <Button type="submit" disabled={busy} className="mt-2 h-12 gap-2 bg-[#1f2523] text-base text-white hover:bg-[#343b37] active:scale-[0.98]">
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <Link
            href="/track"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted shadow-2xs transition active:scale-[0.98]"
          >
            <Search className="size-3.5 text-blue-600 dark:text-blue-400" />
            <span>Track a Package with Code</span>
          </Link>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted-foreground">
          Sign in with your company account, or use <span className="font-medium text-foreground">Track a Package</span>{' '}
          above to follow a delivery without an account.
        </p>
      </div>
    </div>
  )
}
