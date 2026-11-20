// ─────────────────────────────────────────────────────────────────────────────
// Types mirroring the CavGo backend GraphQL schema (src/main/resources/graphql/schema.graphqls)
// Keep enum values exactly in sync with the backend.
// ─────────────────────────────────────────────────────────────────────────────

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'CUSTOMER' | 'WORKER' | 'DRIVER'
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING'

// ─── Company access / onboarding (cavgomain REST via gateway /main/**) ───────

/** Mirror of cavgomain CompanyAccessRequestStatus enum. */
export type CompanyRequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

export interface CompanyAccessRequestStatus {
  id: string
  status: CompanyRequestStatus
  companyId?: string | null
  companyName?: string | null
  role?: string | null
  rejectionReason?: string | null
  createdAt?: string | null
}

export interface CompanyOffice {
  id: string
  name: string | null
  companyName: string | null
  address: string | null
  city: string | null
  phone: string | null
  /** Stable office-location UUID shared with ikuriyebackend. */
  officeLocationId: string | null
  latitude: number | null
  longitude: number | null
  googlePlaceName: string | null
  customName: string | null
  placeId: string | null
}

export type VehicleServiceType = 'PASSENGER' | 'CARGO' | 'PASSENGER_CARGO'

export interface MyCompanyVehicle {
  id?: string | number | null
  licensePlate?: string | null
  serviceType?: VehicleServiceType | string | null
}

export interface MyCompany {
  id: string
  companyId: string | null
  companyName: string | null
  role: string | null
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  phone?: string | null
  office: CompanyOffice | null
  vehicle?: MyCompanyVehicle | null
}

export interface CompanyPreview {
  id: string
  companyName: string
  address?: string | null
  city?: string | null
  status?: string | null
}
export type DeliveryType = 'OPEN' | 'FIXED_ROUTE'
export type CustodianRole = 'WORKER' | 'DRIVER' | 'OFFICE' | 'RECEIVER'
export type LocationType = 'ORIGIN' | 'DESTINATION'
export type PersonRole = 'SENDER' | 'RECEIVER'
export type SortOrder = 'ASC' | 'DESC'

export type PackageStatus =
  | 'CREATED'
  | 'ACCEPTED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'PENDING_CONFIRMATION'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ORIGIN_OFFICE'
  | 'ASSIGNED_DRIVER'
  | 'DESTINATION_OFFICE'
  | 'READY_FOR_COLLECTION'

export type TransferRuleType = 'AUTO' | 'SECURE' | 'CONFIRM'
export type TransferAcceptorType = 'WORKER' | 'DRIVER' | 'BOTH'
export type TransferStatus = 'PENDING' | 'REQUESTED' | 'DONE' | 'CANCELED'

export interface User {
  id: string
  email: string
  phone: string | null
  firstName: string | null
  lastName: string | null
  username: string | null
  role: Role
  status: UserStatus
  createdAt: string
  updatedAt: string
  driverStatus?: 'ONLINE' | 'OFFLINE' | null
}

export interface PackageCustodian {
  id: string
  userId: string
  name: string | null
  phone: string | null
  role: CustodianRole
  assignedAt: string
}

export interface PackagePerson {
  id: string
  role: PersonRole
  userId: string | null
  name: string | null
  phone: string | null
}

export interface PackageLocation {
  id: string
  type: LocationType
  latitude: number
  longitude: number
  placeName: string | null
  placeId: string | null
  officeLocationId: string | null
}

export interface PackageMedia {
  id: string
  url: string
  mimeType: string
}

export interface PackageDetails {
  category: string | null
  description: string | null
  fragile: boolean
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  declaredValue: number | null
  media: PackageMedia[] | null
}

export interface PackageEvent {
  id: string
  eventType: string
  actorId: string
  description: string | null
  createdAt: string
}

export interface PackageCustody {
  id: string
  fromEntity: string
  toEntity: string
  timestamp: string
  notes: string | null
}

export interface TransferPackageLink {
  id: string
  transferId: string
  packageId: string
  addedBy: string
  addedAt: string
}

export interface Transfer {
  id: string
  creatorId: string
  ruleType: TransferRuleType
  acceptorType: TransferAcceptorType
  matchCompanyId: string | null
  matchUserId: string | null
  requestorId: string | null
  status: TransferStatus
  transferCode: string | null
  packages: TransferPackageLink[]
  createdAt: string
  updatedAt: string
}

export interface DeliveryPackage {
  id: string
  trackingCode: string
  deliveryType: DeliveryType
  status: PackageStatus
  creatorId: string
  companyId: string | null
  tripId: string | null
  custodians: PackageCustodian[]
  people: PackagePerson[]
  locations: PackageLocation[]
  details: PackageDetails | null
  // Optional: list queries select a slim field set that omits these —
  // only detail queries (fetchPackageById) return them.
  events?: PackageEvent[]
  custody?: PackageCustody[]
  transfers: Transfer[]
  createdAt: string
  updatedAt: string
}

export interface DeliveryPackagePage {
  items: DeliveryPackage[]
  totalCount: number
  totalPages: number
  currentPage: number
}

export interface NoticeViewer {
  id: string
  noticeId: string
  userId: string
  deliveredAt: string | null
  readAt: string | null
}

export interface Notice {
  id: string
  resourceType: string
  resourceId: string
  eventType: string
  actorId: string | null
  title: string
  message: string
  payload: string | null
  viewer: NoticeViewer
  createdAt: string
}

export interface TransferAcceptResult {
  transfer: Transfer
  acceptedPackages: { deliveryPackage: DeliveryPackage }[]
}

export interface PackageCreation {
  deliveryPackage: DeliveryPackage
  transfer: Transfer | null
}

export interface DeliveryCodeResult {
  deliveryPackage: DeliveryPackage
  /** Never returned to the initiating worker/driver — they must obtain it from the recipient. */
  deliveryCode?: string | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Frontend view model — what the workspace UI actually renders.
// ─────────────────────────────────────────────────────────────────────────────

export interface CustodianRef {
  userId: string
  name: string
  role: CustodianRole
}

export interface PackageItem {
  id: string // internal UUID — used for every mutation
  trackingCode: string // public CAV-XXXXXXXX code — used for display
  deliveryType: DeliveryType
  status: PackageStatus
  sender: string
  receiver: string
  origin: string
  destination: string
  weight: string | null
  category: string | null
  description: string | null
  fragile: boolean
  photos: string[]
  currentCustodian: CustodianRef | null
  assignedDriver: string | null
  isMine: boolean // authenticated user is the current custodian
  isCreator: boolean // authenticated user created the package
  openTransfer: Transfer | null // PENDING / REQUESTED transfer containing the package
  events: PackageEvent[]
  custody: PackageCustody[]
  updatedAt: string
}

export type GroupKey =
  | 'waiting-us'
  | 'waiting-others'
  | 'at-office'
  | 'in-transit'
  | 'awaiting-confirmation'
  | 'delivered'
  | 'completed'
  | 'cancelled'
