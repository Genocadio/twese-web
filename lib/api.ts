import { gql, LOCATIONS_URL, rest } from './client'
import type {
  CompanyAccessRequestStatus,
  CompanyOffice,
  CompanyPreview,
  DeliveryCodeResult,
  DeliveryPackage,
  DeliveryPackagePage,
  MyCompany,
  Notice,
  PackageCreation,
  PackageItem,
  PackageStatus,
  SortOrder,
  Transfer,
  TransferAcceptResult,
  TransferRuleType,
  User,
} from './types'
import { weightLabel } from './format'

// ─────────────────────────────────────────────────────────────────────────────
// Shared fragments
// ─────────────────────────────────────────────────────────────────────────────

const TRANSFER_FIELDS = `
  id creatorId ruleType acceptorType matchCompanyId matchUserId requestorId status transferCode
  packages { id transferId packageId addedBy addedAt }
  createdAt updatedAt
`

// Slim selection for list views: skips events/custody/media. The old full
// tree made every list item pull its whole history — for a 200-package page
// that was thousands of nested rows per request. Detail views use
// PACKAGE_FIELDS (fetched per package on open).
const PACKAGE_LIST_FIELDS = `
  id trackingCode deliveryType status creatorId companyId tripId
  custodians { id userId name phone role assignedAt }
  people { id role userId name phone }
  locations { id type latitude longitude placeName placeId officeLocationId }
  details { category description fragile weight length width height declaredValue }
  transfers { ${TRANSFER_FIELDS} }
  createdAt updatedAt
`

const PACKAGE_FIELDS = `
  id trackingCode deliveryType status creatorId companyId tripId
  custodians { id userId name phone role assignedAt }
  people { id role userId name phone }
  locations { id type latitude longitude placeName placeId officeLocationId }
  details {
    category description fragile weight length width height declaredValue
    media { id url mimeType }
  }
  events { id eventType actorId description createdAt }
  custody { id fromEntity toEntity timestamp notes }
  transfers { ${TRANSFER_FIELDS} }
  createdAt updatedAt
`

// ─────────────────────────────────────────────────────────────────────────────
// Location search (cavgotrips REST API via gateway)
// ─────────────────────────────────────────────────────────────────────────────

export interface TripLocation {
  id: number
  latitude: number
  longitude: number
  google_place_name: string | null
  custom_name: string | null
  province: string | null
  district: string | null
  place_id: string | null
  code: string | null
}

export interface LocationsResponse {
  data: TripLocation[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

let _locationsAbort: AbortController | null = null

/**
 * Search locations from cavgotrips. Aborts any in-flight request so rapid
 * keystrokes don't stack up responses out of order.
 */
export async function searchLocations(query: string, limit = 20): Promise<TripLocation[]> {
  if (_locationsAbort) _locationsAbort.abort()
  _locationsAbort = new AbortController()
  const url = `${LOCATIONS_URL}?search=${encodeURIComponent(query)}&limit=${limit}&page=1`
  try {
    const res = await fetch(url, { signal: _locationsAbort.signal })
    if (!res.ok) return []
    const json: LocationsResponse = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Company access / onboarding (cavgomain REST via the gateway's /main namespace)
// ─────────────────────────────────────────────────────────────────────────────

interface RawCompanyOffice {
  id?: number | string | null
  name?: string | null
  companyName?: string | null
  address?: string | null
  city?: string | null
  phone?: string | null
  officeLocationId?: string | null
  latitude?: number | null
  longitude?: number | null
  googlePlaceName?: string | null
  customName?: string | null
  placeId?: string | null
}

function toCompanyOffice(raw: RawCompanyOffice | null | undefined): CompanyOffice | null {
  if (!raw) return null
  return {
    id: String(raw.id),
    name: raw.name ?? null,
    companyName: raw.companyName ?? null,
    address: raw.address ?? null,
    city: raw.city ?? null,
    phone: raw.phone ?? null,
    officeLocationId:
      raw.officeLocationId != null ? String(raw.officeLocationId) : null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    googlePlaceName: raw.googlePlaceName ?? null,
    customName: raw.customName ?? null,
    placeId: raw.placeId ?? null,
  }
}

function toMyCompany(raw: {
  id?: number | string
  companyId?: number | string | null
  companyName?: string | null
  role?: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  office?: RawCompanyOffice | null
} | null): MyCompany | null {
  if (!raw) return null
  return {
    id: String(raw.id),
    companyId: raw.companyId != null ? String(raw.companyId) : null,
    companyName: raw.companyName ?? null,
    role: raw.role ?? null,
    firstName: raw.firstName ?? null,
    lastName: raw.lastName ?? null,
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    office: toCompanyOffice(raw.office),
  }
}

/** The authenticated user's company membership, or null when not a member. */
function toMyCompanyFromSync(raw: RawSyncResponse | null): MyCompany | null {
  if (!raw?.company) return null
  const user = raw.user ?? {}
  return toMyCompany({
    id: user.id,
    companyId: raw.company.companyId,
    companyName: raw.company.companyName,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    office: raw.company.office,
  })
}

interface RawSyncUser {
  id?: number | string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  role?: string | null
  status?: string | null
}

interface RawSyncCompany {
  companyId?: number | string | null
  companyName?: string | null
  companyCode?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  city?: string | null
  office?: RawCompanyOffice | null
}

interface RawSyncAccessRequest {
  id?: number | string
  status?: string | null
  rejectionReason?: string | null
  companyCode?: string | null
  companyId?: number | string | null
  companyName?: string | null
}

interface RawSyncResponse {
  user?: RawSyncUser | null
  company?: RawSyncCompany | null
  accessRequest?: RawSyncAccessRequest | null
}

export interface SyncProfile {
  company: MyCompany | null
  accessRequest: CompanyAccessRequestStatus | null
}

/**
 * The authenticated user's full context from POST /main/users/sync in ONE
 * request: {@code company} (null when not a member) and {@code accessRequest}
 * (null when there is none). All current-user /main data flows through this.
 */
export function fetchSyncProfile(token: string): Promise<SyncProfile> {
  return rest<RawSyncResponse>('/main/users/sync', { token, method: 'POST' }).then((res) => {
    const raw = res.data ?? {}
    return {
      company: toMyCompanyFromSync(raw),
      accessRequest: toRequestStatus(raw.accessRequest ?? null),
    }
  })
}

/**
 * The authenticated user's company membership, or null when not a member.
 * Kept as a thin wrapper over [fetchSyncProfile] for callers that only need
 * the membership half of the sync payload.
 */
export function fetchMyCompany(token: string): Promise<MyCompany | null> {
  return fetchSyncProfile(token).then((r) => r.company)
}

function toRequestStatus(raw: {
  id?: number | string
  status?: string | null
  companyId?: number | string | null
  companyName?: string | null
  role?: string | null
  rejectionReason?: string | null
  createdAt?: string | null
} | null): CompanyAccessRequestStatus | null {
  if (!raw) return null
  const status = raw.status === 'APPROVED' || raw.status === 'REJECTED' ? raw.status : 'PENDING'
  return {
    id: String(raw.id),
    status,
    companyId: raw.companyId != null ? String(raw.companyId) : null,
    companyName: raw.companyName ?? null,
    role: raw.role ?? null,
    rejectionReason: raw.rejectionReason ?? null,
    createdAt: raw.createdAt ?? null,
  }
}

/** The user's latest company access request (status + reason), or null if none. */
export function fetchMyCompanyAccessStatus(token: string): Promise<CompanyAccessRequestStatus | null> {
  return rest<{
    id?: number | string
    status?: string | null
    companyId?: number | string | null
    companyName?: string | null
    role?: string | null
    rejectionReason?: string | null
    createdAt?: string | null
  }>('/main/company-access-requests/my-status', { token }).then((res) => toRequestStatus(res.data))
}

/** Submits a company access request for the given company code. */
export function requestCompanyAccess(token: string, companyCode: string): Promise<CompanyAccessRequestStatus> {
  return rest<{
    id?: number | string
    status?: string | null
    companyId?: number | string | null
    companyName?: string | null
    role?: string | null
    rejectionReason?: string | null
    createdAt?: string | null
  }>('/main/company-access-requests', { token, method: 'POST', body: { companyCode } }).then((res) => {
    const mapped = toRequestStatus(res.data)
    if (!mapped) throw new Error('The company access request was not accepted by Twese.')
    return mapped
  })
}

/** Validates a company code and returns company details (for the join screen). */
export function fetchCompanyByCode(token: string, code: string): Promise<CompanyPreview | null> {
  return rest<{
    id?: number | string
    companyName?: string | null
    address?: string | null
    city?: string | null
    status?: string | null
  }>(`/main/companies/by-code/${encodeURIComponent(code)}`, { token }).then((res) => {
    const raw = res.data
    if (!raw || raw.companyName == null) return null
    return {
      id: String(raw.id),
      companyName: raw.companyName,
      address: raw.address ?? null,
      city: raw.city ?? null,
      status: raw.status ?? null,
    }
  })
}

/** Offices of a company — for the "pick your office" step after approval. */
export function fetchOffices(token: string, companyId: string): Promise<CompanyOffice[]> {
  return rest<RawCompanyOffice[]>(`/main/offices?companyId=${encodeURIComponent(companyId)}`, { token })
    .then((res) => (res.data ?? []).map((o) => toCompanyOffice(o)).filter((o): o is CompanyOffice => o != null))
}

/** Self-service office assignment (worker picks their office after approval). */
export function assignMyOffice(token: string, userId: string, officeId: string): Promise<MyCompany | null> {
  return rest<{
    id?: number | string
    companyId?: number | string | null
    companyName?: string | null
    role?: string | null
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    office?: RawCompanyOffice | null
  }>(`/main/staff/${encodeURIComponent(userId)}/office/${encodeURIComponent(officeId)}`, {
    token,
    method: 'PUT',
  }).then((res) => toMyCompany(res.data))
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface MyProfileData {
  myProfile: User
}

export function fetchProfile(token: string): Promise<MyProfileData> {
  return gql<MyProfileData>(
    {
      query: `query MyProfile { myProfile { id email phone firstName lastName username role status createdAt updatedAt } }`,
      token,
    },
  )
}

export interface PackagesData {
  myPackages: DeliveryPackagePage
}

export function fetchMyPackages(token: string, opts?: { status?: PackageStatus; order?: SortOrder; page?: number; size?: number }): Promise<PackagesData> {
  return gql<PackagesData>(
    {
      query: `query MyPackages($status: PackageStatus, $order: SortOrder, $page: Int, $size: Int) {
        myPackages(status: $status, order: $order, page: $page, size: $size) {
          items { ${PACKAGE_LIST_FIELDS} }
          totalCount totalPages currentPage
        }
      }`,
      variables: {
        status: opts?.status ?? null,
        order: opts?.order ?? 'DESC',
        page: opts?.page ?? 0,
        size: opts?.size ?? 25,
      },
      token,
    },
  )
}

export function fetchAvailablePackages(token: string, size = 25): Promise<{ availablePackages: DeliveryPackagePage }> {
  return gql<{ availablePackages: DeliveryPackagePage }>(
    {
      query: `query AvailablePackages($size: Int) {
        availablePackages(page: 0, size: $size) {
          items { ${PACKAGE_LIST_FIELDS} }
          totalCount totalPages currentPage
        }
      }`,
      variables: { size },
      token,
    },
  )
}

export function fetchPackageById(token: string, packageId: string): Promise<{ package: DeliveryPackage }> {
  return gql<{ package: DeliveryPackage }>(
    {
      query: `query PackageById($id: ID!) { package(id: $id) { ${PACKAGE_FIELDS} } }`,
      variables: { id: packageId },
      token,
    },
  )
}

export function fetchMyTransfers(token: string): Promise<{ myTransfers: Transfer[] }> {
  return gql<{ myTransfers: Transfer[] }>(
    {
      query: `query MyTransfers { myTransfers { ${TRANSFER_FIELDS} } }`,
      token,
    },
  )
}

export function fetchTransfersByStatus(token: string, status: Transfer['status']): Promise<{ transfersByStatus: Transfer[] }> {
  return gql<{ transfersByStatus: Transfer[] }>(
    {
      query: `query TransfersByStatus($status: TransferStatus!) { transfersByStatus(status: $status) { ${TRANSFER_FIELDS} } }`,
      variables: { status },
      token,
    },
  )
}

export function fetchMyNotices(token: string): Promise<{ myNotices: Notice[] }> {
  return gql<{ myNotices: Notice[] }>(
    {
      query: `query MyNotices {
        myNotices {
          id resourceType resourceId eventType actorId title message payload
          viewer { id noticeId userId deliveredAt readAt }
          createdAt
        }
      }`,
      token,
    },
  )
}

export function fetchUnreadCount(token: string): Promise<{ unreadNoticeCount: number }> {
  return gql<{ unreadNoticeCount: number }>(
    {
      query: `query UnreadNoticeCount { unreadNoticeCount }`,
      token,
    },
  )
}

export function fetchDrivers(token: string, query = ''): Promise<{ searchUsers: User[] }> {
  return gql<{ searchUsers: User[] }>(
    {
      query: `query SearchDrivers($query: String) {
        searchUsers(query: $query, role: DRIVER) { id firstName lastName email phone username role status driverStatus }
      }`,
      variables: { query },
      token,
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────────────

export function acceptTransfer(token: string, transferId: string, transferCode?: string): Promise<{ acceptTransfer: TransferAcceptResult }> {
  return gql<{ acceptTransfer: TransferAcceptResult }>(
    {
      query: `mutation AcceptTransfer($input: AcceptTransferInput!) {
        acceptTransfer(input: $input) {
          transfer { id ruleType acceptorType status requestorId }
          acceptedPackages { deliveryPackage { id trackingCode status } }
        }
      }`,
      variables: { input: { transferId, transferCode: transferCode ?? null } },
      token,
    },
  )
}

export interface CreatePackageInput {
  deliveryType: 'OPEN' | 'FIXED_ROUTE'
  sender?: { role: 'SENDER'; userId?: string | null; name?: string | null; phone?: string | null }
  receiver: { role: 'RECEIVER'; userId?: string | null; name?: string | null; phone?: string | null }
  origin: { type: 'ORIGIN'; latitude: number; longitude: number; placeName?: string | null; placeId?: string | null; officeLocationId?: string | null }
  destination: { type: 'DESTINATION'; latitude: number; longitude: number; placeName?: string | null; placeId?: string | null; officeLocationId?: string | null }
  details?: {
    category?: string | null
    description?: string | null
    fragile?: boolean | null
    weight?: number | null
    declaredValue?: number | null
  } | null
  transferRuleType?: TransferRuleType | null
  transferMatchCompanyId?: string | null
  transferMatchUserId?: string | null
}

export function createPackage(token: string, input: CreatePackageInput): Promise<{ createPackage: PackageCreation }> {
  return gql<{ createPackage: PackageCreation }>(
    {
      query: `mutation CreatePackage($input: CreatePackageInput!) {
        createPackage(input: $input) {
          deliveryPackage { ${PACKAGE_FIELDS} }
          transfer { ${TRANSFER_FIELDS} }
        }
      }`,
      variables: { input },
      token,
    },
  )
}

export function createTransfer(
  token: string,
  packageIds: string[],
  ruleType: TransferRuleType,
  acceptorType?: 'WORKER' | 'DRIVER' | 'BOTH',
  matchUserId?: string | null
): Promise<{ createTransfer: Transfer }> {
  return gql<{ createTransfer: Transfer }>(
    {
      query: `mutation CreateTransfer($input: CreateTransferInput!) {
        createTransfer(input: $input) { ${TRANSFER_FIELDS} }
      }`,
      variables: { input: { packageIds, ruleType, acceptorType: acceptorType ?? null, matchUserId: matchUserId ?? null } },
      token,
    },
  )
}

export function addPackagesToTransfer(token: string, transferId: string, packageIds: string[]): Promise<{ addPackagesToTransfer: Transfer }> {
  return gql<{ addPackagesToTransfer: Transfer }>(
    {
      query: `mutation AddPackagesToTransfer($input: AddPackagesToTransferInput!) {
        addPackagesToTransfer(input: $input) { ${TRANSFER_FIELDS} }
      }`,
      variables: { input: { transferId, packageIds } },
      token,
    },
  )
}

export function assignDriver(token: string, packageId: string, driverId: string, assignedBy: string, notes?: string): Promise<{ assignDriver: DeliveryPackage }> {
  return gql<{ assignDriver: DeliveryPackage }>(
    {
      query: `mutation AssignDriver($input: AssignDriverInput!) {
        assignDriver(input: $input) { id trackingCode status }
      }`,
      variables: { input: { packageId, driverId, assignedBy, notes: notes ?? null } },
      token,
    },
  )
}

export function updatePackageStatus(token: string, packageId: string, status: PackageStatus, notes?: string): Promise<{ updatePackageStatus: DeliveryPackage }> {
  return gql<{ updatePackageStatus: DeliveryPackage }>(
    {
      query: `mutation UpdatePackageStatus($input: UpdatePackageStatusInput!) {
        updatePackageStatus(input: $input) { id trackingCode status }
      }`,
      variables: { input: { packageId, status, notes: notes ?? null } },
      token,
    },
  )
}

export function initiateDelivery(token: string, packageId: string): Promise<{ initiateDelivery: DeliveryCodeResult }> {
  return gql<{ initiateDelivery: DeliveryCodeResult }>(
    {
      query: `mutation InitiateDelivery($input: InitiateDeliveryInput!) {
        initiateDelivery(input: $input) { deliveryPackage { id status } }
      }`,
      variables: { input: { packageId } },
      token,
    },
  )
}

export function confirmDelivery(token: string, packageId: string, deliveryCode: string): Promise<{ confirmDelivery: DeliveryPackage }> {
  return gql<{ confirmDelivery: DeliveryPackage }>(
    {
      query: `mutation ConfirmDelivery($input: ConfirmDeliveryInput!) {
        confirmDelivery(input: $input) { id trackingCode status }
      }`,
      variables: { input: { packageId, deliveryCode } },
      token,
    },
  )
}

export function regenerateDeliveryCode(token: string, packageId: string): Promise<{ regenerateDeliveryCode: DeliveryCodeResult }> {
  return gql<{ regenerateDeliveryCode: DeliveryCodeResult }>(
    {
      query: `mutation RegenerateDeliveryCode($input: RegenerateDeliveryCodeInput!) {
        regenerateDeliveryCode(input: $input) { deliveryPackage { id status } }
      }`,
      variables: { input: { packageId } },
      token,
    },
  )
}

export function regenerateTransferCode(token: string, transferId: string): Promise<{ regenerateTransferCode: Transfer }> {
  return gql<{ regenerateTransferCode: Transfer }>(
    {
      query: `mutation RegenerateTransferCode($input: RegenerateTransferCodeInput!) {
        regenerateTransferCode(input: $input) { ${TRANSFER_FIELDS} }
      }`,
      variables: { input: { transferId } },
      token,
    },
  )
}

export function cancelTransfer(token: string, transferId: string): Promise<{ cancelTransfer: Transfer }> {
  return gql<{ cancelTransfer: Transfer }>(
    {
      query: `mutation CancelTransfer($transferId: ID!) { cancelTransfer(transferId: $transferId) { id status } }`,
      variables: { transferId },
      token,
    },
  )
}

export function confirmTransfer(token: string, transferId: string): Promise<{ confirmTransfer: Transfer }> {
  return gql<{ confirmTransfer: Transfer }>(
    {
      query: `mutation ConfirmTransfer($transferId: ID!) { confirmTransfer(transferId: $transferId) { id status } }`,
      variables: { transferId },
      token,
    },
  )
}

export function rejectTransfer(token: string, transferId: string): Promise<{ rejectTransfer: Transfer }> {
  return gql<{ rejectTransfer: Transfer }>(
    {
      query: `mutation RejectTransfer($transferId: ID!) { rejectTransfer(transferId: $transferId) { id status } }`,
      variables: { transferId },
      token,
    },
  )
}

export function markNoticeRead(token: string, viewerId: string): Promise<{ markNoticeRead: { id: string } }> {
  return gql<{ markNoticeRead: { id: string } }>(
    {
      query: `mutation MarkNoticeRead($viewerId: ID!) { markNoticeRead(viewerId: $viewerId) { id } }`,
      variables: { viewerId },
      token,
    },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Mapping: backend DeliveryPackage → frontend PackageItem
// ─────────────────────────────────────────────────────────────────────────────

export function toPackageItem(pkg: DeliveryPackage, meId: string): PackageItem {
  const sender = pkg.people.find((p) => p.role === 'SENDER')
  const receiver = pkg.people.find((p) => p.role === 'RECEIVER')
  const origin = pkg.locations.find((l) => l.type === 'ORIGIN')
  const destination = pkg.locations.find((l) => l.type === 'DESTINATION')

  const custodians = [...pkg.custodians].sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  const current = custodians[0] ?? null
  const driver = custodians.find((c) => c.role === 'DRIVER')

  const openTransfer = pkg.transfers.find((t) => t.status === 'PENDING' || t.status === 'REQUESTED') ?? null
  const media = pkg.details?.media ?? []
  const photos = media.filter((m) => m.mimeType.startsWith('image/')).map((m) => m.url)

  return {
    id: pkg.id,
    trackingCode: pkg.trackingCode,
    deliveryType: pkg.deliveryType,
    status: pkg.status,
    sender: sender?.name ?? 'Sender',
    receiver: receiver?.name ?? 'Receiver',
    origin: origin?.placeName ?? 'Origin',
    destination: destination?.placeName ?? 'Destination',
    weight: weightLabel(pkg.details?.weight ?? null),
    category: pkg.details?.category ?? null,
    description: pkg.details?.description ?? null,
    fragile: pkg.details?.fragile ?? false,
    photos,
    currentCustodian: current
      ? { userId: current.userId, name: current.name ?? 'Custodian', role: current.role }
      : null,
    assignedDriver: driver?.name ?? null,
    isMine: current?.userId === meId,
    isCreator: pkg.creatorId === meId,
    openTransfer,
    events: pkg.events ?? [],
    custody: pkg.custody ?? [],
    updatedAt: pkg.updatedAt,
  }
}
