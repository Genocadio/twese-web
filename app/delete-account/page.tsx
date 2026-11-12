'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { AlertCircle, CheckCircle2, ChevronLeft, Loader2, Lock, ShieldAlert, Trash2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { deleteAccountDirect } from '@/lib/auth'

export default function DeleteAccountPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleted, setDeleted] = useState(false)

  async function handleDelete(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    try {
      await deleteAccountDirect(identifier.trim(), password)
      setDeleted(true)
    } catch (err: any) {
      setError(err.message || 'Failed to delete account. Please verify your credentials and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Header / Logo */}
        <div className="mb-6 flex flex-col items-center text-center">
          <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition">
            <ChevronLeft className="size-4" /> Back to Console
          </Link>
          <Image src="/logo.png" width={64} height={64} alt="Twese" className="size-14 object-contain drop-shadow-md" priority />
          <p className="mt-3 font-mono text-xl font-bold tracking-tight text-red-600 dark:text-red-400">
            Delete Twese Account
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Permanent account and personal data deletion
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {deleted ? (
            <div className="flex flex-col items-center py-4 text-center space-y-4">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                <CheckCircle2 className="size-8" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Account Deletion Scheduled</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your account has been deactivated immediately and you can no longer log in. In accordance with Google Play data policy and Rwandan data protection laws, all your personal records, photos, and tracking logs will be permanently deleted after 30 days.
              </p>
              <div className="pt-2 w-full">
                <Link href="/" className="w-full">
                  <Button variant="outline" className="w-full h-10 text-xs">
                    Return to Login
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50/70 p-3.5 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                <ShieldAlert className="size-4 shrink-0 text-red-600 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold">One-Step Direct Account Deletion</p>
                  <p className="text-[11px] leading-relaxed text-red-700/90 dark:text-red-300/90">
                    Enter your phone number, email, or username and your password below. Submitting will authenticate and delete your account in one step.
                  </p>
                </div>
              </div>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-300">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleDelete} className="mt-5 flex flex-col gap-3.5">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Phone, Email, or Username</span>
                  <div className="relative">
                    <User className="absolute left-3 top-3 size-4 text-muted-foreground" />
                    <Input
                      type="text"
                      required
                      autoComplete="username"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder="+250 780 000 000 or email"
                      className="h-10 pl-9"
                    />
                  </div>
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
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="h-10 pl-9"
                    />
                  </div>
                </label>

                <Button
                  type="submit"
                  disabled={busy || !identifier.trim() || !password}
                  className="mt-2 h-10 gap-2 bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 cursor-pointer font-semibold text-xs"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                  {busy ? 'Verifying & Deleting…' : 'Delete My Account'}
                </Button>
              </form>

              <div className="mt-5 border-t border-border pt-4 text-center">
                <Link href="/" className="text-xs text-muted-foreground hover:text-foreground transition">
                  Changed your mind? Return to Login
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Twese (<code className="font-mono text-[10px]">com.gocavgo.twese</code>) &copy; {new Date().getFullYear()} CavGo.
        </p>
      </div>
    </div>
  )
}
