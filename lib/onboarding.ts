'use client'

import { useCallback, useEffect, useState } from 'react'
import { isAuthError } from './client'
import * as api from './api'
import type { CompanyAccessRequestStatus, CompanyOffice, MyCompany } from './types'

export type OnboardingPhase = 'join' | 'waiting' | 'office' | 'member'

export interface OnboardingState {
  /** 'member' → the worker is attached to a company and can open the workspace. */
  phase: OnboardingPhase
  company: MyCompany | null
  pendingAccess: CompanyAccessRequestStatus | null
  offices: CompanyOffice[]
  officesLoading: boolean
  busy: boolean
  error: string | null
}

export interface OnboardingActions {
  requestAccess: (code: string) => Promise<boolean>
  pickOffice: (officeId: string) => Promise<boolean>
  /** Re-run the membership check (used by the waiting poll and manual retries). */
  refresh: () => Promise<void>
}

/** Seconds between polls while a company access request is pending approval. */
export const WAITING_POLL_INTERVAL_MS = 20_000

/**
 * Worker onboarding state machine for the web portal.
 *
 * The phase starts optimistically as 'member' so a worker with a company and an
 * office lands straight in the workspace — no "checking" step. The membership
 * check then runs silently in the background and corrects course only when
 * needed:
 *
 *  member (has company + office) → stays in the workspace
 *  member, no office             → office picker
 *  not a member, request pending → waiting (polls every 20s)
 *  not a member ->                join screen (enter the company code)
 *
 * Company data is read from cavgomain via the gateway's /main namespace.
 *
 * @param role the role carried by the current JWT (from the Nexxauth session).
 *        A role change in Nexxauth only lands in a NEW token, so once the
 *        membership check confirms the user belongs to a company but their
 *        token role is not yet WORKER/DRIVER, {@code onRoleRefreshNeeded} is
 *        fired so the host can proactively re-issue the token via /auth/refresh.
 */
export function useOnboarding(
  token: string | null,
  onAuthError: () => void,
  role: string | null,
  onRoleRefreshNeeded: () => void,
): OnboardingState & OnboardingActions {
  const [state, setState] = useState<OnboardingState>({
    phase: 'member',
    company: null,
    pendingAccess: null,
    offices: [],
    officesLoading: false,
    busy: false,
    error: null,
  })

  const checkMembership = useCallback(async (): Promise<void> => {
    if (!token || token === 'demo-token') return
    try {
      // Single sync call carries both the membership AND the access-request
      // status — no separate /main read for current-user data.
      const { company: me, accessRequest: pendingAccess } = await api.fetchSyncProfile(token)
      if (me) {
        const needsOffice =
          me.role !== 'DRIVER' && me.companyId != null && me.office == null
        setState((prev) => ({
          ...prev,
          phase: needsOffice ? 'office' : 'member',
          company: me,
          pendingAccess: null,
          error: null,
        }))
        // The user is a company member, but their token role has not caught up
        // with the role Nexxauth now assigns (e.g. approved as WORKER while the
        // token still says CUSTOMER). Request a fresh token so the workspace's
        // role checks pass.
        if (role && role !== 'WORKER' && role !== 'DRIVER') {
          onRoleRefreshNeeded()
        }
        return
      }
      // Not a company member yet — the sync payload carried the request status.
      setState((prev) => ({
        ...prev,
        pendingAccess: pendingAccess,
        company: null,
        phase: pendingAccess == null || pendingAccess.status === 'REJECTED' ? 'join' : 'waiting',
        error: null,
      }))
    } catch (error) {
      if (isAuthError(error)) {
        onAuthError()
        return
      }
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Could not check your company status.',
      }))
    }
  }, [token, onAuthError, role, onRoleRefreshNeeded])

  // Run the membership check on mount / when a token becomes available.
  useEffect(() => {
    if (!token) return
    void checkMembership()
  }, [token, checkMembership])

  // Poll the access request status while it is pending — on approval the
  // membership re-check flips the phase to 'office'/'member' automatically.
  useEffect(() => {
    if (state.phase !== 'waiting' || !token) return
    const id = window.setInterval(() => {
      void checkMembership()
    }, WAITING_POLL_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [state.phase, token, checkMembership])

  // Load the office list once when the office picker phase is reached.
  const companyId = state.company?.companyId
  useEffect(() => {
    if (state.phase !== 'office' || !token || !companyId || state.offices.length > 0) return
    setState((prev) => ({ ...prev, officesLoading: true, error: null }))
    api
      .fetchOffices(token, companyId)
      .then((offices) => setState((prev) => ({ ...prev, offices })))
      .catch((error) => {
        if (!isAuthError(error)) {
          setState((prev) => ({
            ...prev,
            error: error instanceof Error ? error.message : 'Could not load the company offices.',
          }))
        }
      })
      .finally(() => setState((prev) => ({ ...prev, officesLoading: false })))
  }, [state.phase, token, companyId, state.offices.length, onAuthError])

  const requestAccess = useCallback(
    async (code: string): Promise<boolean> => {
      if (!token) return false
      setState((prev) => ({ ...prev, busy: true, error: null }))
      try {
        await api.requestCompanyAccess(token, code.trim())
        await checkMembership()
        return true
      } catch (error) {
        if (isAuthError(error)) {
          onAuthError()
          return false
        }
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Your request could not be submitted.',
        }))
        return false
      } finally {
        setState((prev) => (prev.busy ? { ...prev, busy: false } : prev))
      }
    },
    [token, checkMembership, onAuthError],
  )

  const pickOffice = useCallback(
    async (officeId: string): Promise<boolean> => {
      const userId = state.company?.id
      if (!token || !userId) return false
      setState((prev) => ({ ...prev, busy: true, error: null }))
      try {
        const updated = await api.assignMyOffice(token, userId, officeId)
        if (updated) {
          setState((prev) => ({
            ...prev,
            phase: 'member',
            company: updated,
            busy: false,
          }))
          return true
        }
        await checkMembership()
        setState((prev) => (prev.busy ? { ...prev, busy: false } : prev))
        return Boolean(state.company?.office)
      } catch (error) {
        if (isAuthError(error)) {
          onAuthError()
          return false
        }
        setState((prev) => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Could not assign the office.',
        }))
        return false
      } finally {
        setState((prev) => (prev.busy ? { ...prev, busy: false } : prev))
      }
    },
    [token, state.company, checkMembership, onAuthError],
  )

  return { ...state, requestAccess, pickOffice, refresh: checkMembership }
}