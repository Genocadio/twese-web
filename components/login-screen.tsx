'use client'

import { useState } from 'react'
import Image from 'next/image'
import { AlertCircle, Loader2, Lock } from 'lucide-react'
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
          <p className="mt-1 text-xs uppercase tracking-[0.25em] text-muted-foreground">Worker console</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={submitPassword} className="mt-5 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Email</span>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="worker@twese.example"
                  className="h-10"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Password</span>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="h-10 pl-9"
                  />
                </div>
              </label>
              <Button type="submit" disabled={busy} className="mt-2 h-10 gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]">
                {busy && <Loader2 className="size-4 animate-spin" />}
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>

            </form>

        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Worker accounts must be assigned the <span className="font-mono">WORKER</span> or{' '}
          <span className="font-mono">DRIVER</span> role by a Twese administrator.
        </p>
      </div>
    </div>
  )
}
