'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, ChevronDown, Loader2, LogOut, RefreshCcw, WifiOff } from 'lucide-react'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DENIED_PORTAL_ROLES, useAuth } from '@/lib/auth'
import { useWorkspace } from '@/lib/store'
import { LoginScreen } from '@/components/login-screen'
import { OnboardingGate } from '@/components/onboarding'
import { displayName, initials, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

export function WorkerShell({ children }: { children: React.ReactNode }) {
  const { status, user, logout, isDemo, exitDemoMode, error: authError, retryBootstrap } = useAuth()
  const workspace = useWorkspace()
  const [noticeOpen, setNoticeOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const noticeRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!noticeOpen && !profileOpen) return

    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as Node | null
      if (!target) return

      if (noticeOpen && noticeRef.current && !noticeRef.current.contains(target)) {
        setNoticeOpen(false)
      }
      if (profileOpen && profileRef.current && !profileRef.current.contains(target)) {
        setProfileOpen(false)
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setNoticeOpen(false)
        setProfileOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [noticeOpen, profileOpen])

  if (status === 'loading') {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-xs">Connecting to Twese…</p>
        </div>
      </div>
    )
  }

  if (status === 'signedOut') {
    return (
      <>
        <LoginScreen />
        <ToastContainer position="top-right" autoClose={3200} newestOnTop theme="light" />
      </>
    )
  }

  if (status === 'unreachable') {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <Image src="/logo.png" width={48} height={48} alt="Twese" className="mx-auto size-12 object-contain" />
          <h1 className="mt-4 text-base font-semibold">We can&apos;t reach Twese right now</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {authError ??
              "The Twese service isn't responding. This is usually temporary — please try again in a moment. Your session has been saved."}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="h-9 w-full gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
              onClick={() => void retryBootstrap()}
            >
              <RefreshCcw className="size-3.5" /> Try again
            </Button>
            <Button variant="outline" className="h-9 w-full gap-2" onClick={logout}>
              <LogOut className="size-3.5" /> Log out
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <h1 className="mt-4 text-base font-semibold">We can&apos;t reach Twese right now</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {authError ??
              "The Twese service isn't responding. This is usually temporary — please try again in a moment."}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              className="h-9 w-full gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]"
              onClick={() => void retryBootstrap()}
            >
              <RefreshCcw className="size-3.5" /> Try again
            </Button>
            <Button variant="outline" className="h-9 w-full gap-2" onClick={logout}>
              <LogOut className="size-3.5" /> Log out
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (DENIED_PORTAL_ROLES.includes(user.role)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-lg font-bold text-muted-foreground">
            {initials(user.firstName)}
          </span>
          <h1 className="mt-4 text-base font-semibold">Worker access required</h1>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {user.email ?? 'This account'} is signed in with role{' '}
            <span className="font-mono font-semibold">{user.role}</span>. The worker console is for{' '}
            <span className="font-mono">WORKER</span> and <span className="font-mono">DRIVER</span> accounts — use the
            Twese admin console instead.
          </p>
          <Button className="mt-5 h-9 w-full gap-2 bg-[#1f2523] text-white hover:bg-[#343b37]" onClick={logout}>
            <LogOut className="size-3.5" /> Log out
          </Button>
        </div>
      </div>
    )
  }

  const name = displayName(user)
  const unread = workspace.unread
  return (
    <OnboardingGate>
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <ToastContainer position="top-right" autoClose={3200} newestOnTop theme="light" toastClassName="font-sans text-sm" />
      <header className="z-20 flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur sm:px-6">
        <Link href="/" className="group flex shrink-0 items-center gap-2.5 transition-transform duration-150 hover:scale-[1.02]" aria-label="Twese packages">
          <Image src="/logo.png" width={32} height={32} alt="Twese" className="size-8 object-contain" priority />
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-bold tracking-tight">TWESE</span>
            <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground sm:inline-block">Console</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <div ref={noticeRef} className="relative">
            <button
              className="relative grid size-8.5 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-all duration-150 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground hover:shadow-xs active:translate-y-0 active:scale-95 cursor-pointer"
              aria-label="Notifications"
              aria-expanded={noticeOpen}
              onClick={() => {
                setNoticeOpen((value) => !value)
                setProfileOpen(false)
              }}
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid size-4 place-items-center rounded-full bg-[#ef8d54] text-[9px] font-bold text-white shadow-xs">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {noticeOpen && (
              <div className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-2 shadow-2xl">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-sm font-semibold">Notifications</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {unread} unread
                    </Badge>
                    {unread > 0 && (
                      <button
                        onClick={() => void workspace.markAllRead()}
                        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <CheckCheck className="size-3" /> Mark all read
                      </button>
                    )}
                  </div>
                </div>
                <div className="max-h-[22rem] overflow-y-auto">
                  {workspace.notices.length === 0 ? (
                    <p className="px-3 py-8 text-center text-xs text-muted-foreground">No notifications yet.</p>
                  ) : (
                    workspace.notices.slice(0, 10).map((notice) => (
                      <button
                        key={notice.id}
                        onClick={() => {
                          if (!notice.viewer.readAt) void workspace.markRead(notice.viewer.id)
                        }}
                        className="flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted cursor-pointer"
                      >
                        <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', notice.viewer.readAt ? 'bg-muted-foreground/40' : 'bg-[#ef8d54]')} />
                        <span>
                          <span className={cn('block text-xs', !notice.viewer.readAt && 'font-semibold')}>{notice.title}</span>
                          <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">{notice.message}</span>
                          <span className="mt-1 block font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
                            {notice.eventType} · {timeAgo(notice.createdAt)}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div ref={profileRef} className="relative">
            <button
              className="flex items-center gap-1.5 rounded-full border border-border bg-card p-0.5 pr-2 transition-all duration-150 hover:-translate-y-0.5 hover:shadow-xs active:translate-y-0 active:scale-95 cursor-pointer"
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((value) => !value)
                setNoticeOpen(false)
              }}
            >
              <span className="grid size-7.5 place-items-center rounded-full bg-[#d9e4dc] text-xs font-semibold text-[#31403a]">
                {initials(name)}
              </span>
              <ChevronDown className="hidden size-3.5 text-muted-foreground sm:block" />
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-11 z-50 w-56 rounded-2xl border border-border bg-card p-2 shadow-2xl">
                <div className="border-b border-border px-3 py-2">
                  <p className="text-xs font-semibold">{name}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{user.email}</p>
                  <Badge variant="outline" className="mt-2 font-mono text-[9px] uppercase tracking-wider">
                    {user.role}
                  </Badge>
                </div>
                <button
                  onClick={() => void workspace.refresh()}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-muted cursor-pointer"
                >
                  <RefreshCcw className="size-3.5" /> Refresh data
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    logout()
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-destructive transition-colors hover:bg-muted cursor-pointer"
                >
                  <LogOut className="size-3.5" /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {isDemo && (
        <div className="z-10 flex shrink-0 items-center justify-between border-b border-amber-200/80 bg-amber-50/90 px-4 py-1.5 text-xs text-amber-900 backdrop-blur-xs dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="flex size-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
            <span className="shrink-0 font-semibold">Demo Review Mode:</span>
            <span className="truncate text-amber-800 dark:text-amber-300">
              Interactive review with dummy data (WhatsApp-style master-detail workspace)
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => void workspace.refresh()}
              className="rounded px-2 py-0.5 text-[11px] font-medium bg-amber-200/60 hover:bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100 cursor-pointer transition-colors"
            >
              Reset Data
            </button>
            <button
              onClick={exitDemoMode}
              className="rounded px-2 py-0.5 text-[11px] font-medium bg-amber-200/60 hover:bg-amber-200 text-amber-950 dark:bg-amber-900/60 dark:text-amber-100 cursor-pointer transition-colors"
            >
              Exit Demo
            </button>
          </div>
        </div>
      )}

      {workspace.error && (
        <div className="flex items-center justify-center gap-2 border-b border-red-200 bg-red-50 px-4 py-1.5 text-xs text-red-700">
          <WifiOff className="size-3.5 shrink-0" />
          <span className="truncate">{workspace.error}</span>
          <button onClick={() => void workspace.refresh()} className="shrink-0 font-semibold underline underline-offset-2 cursor-pointer">
            Retry
          </button>
        </div>
      )}

      <main className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">{children}</main>
      </div>
    </OnboardingGate>
  )
}
