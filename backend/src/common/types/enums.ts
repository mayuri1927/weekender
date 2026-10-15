// Local enum definitions matching the Prisma schema.
// Used in DTOs and services; keeps the code compilable without prisma generate.

export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  NON_BINARY = 'NON_BINARY',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum DevicePlatform {
  IOS = 'IOS',
  ANDROID = 'ANDROID',
}

export enum KycStatus {
  KYC_PENDING = 'KYC_PENDING',
  KYC_IN_PROGRESS = 'KYC_IN_PROGRESS',
  KYC_VERIFIED = 'KYC_VERIFIED',
  KYC_FAILED = 'KYC_FAILED',
  KYC_RETRY_REQUIRED = 'KYC_RETRY_REQUIRED',
}

export enum ActivityStatus {
  DRAFT = 'DRAFT',
  OPEN = 'OPEN',
  FULL = 'FULL',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum ActivityVisibility {
  PUBLIC = 'PUBLIC',
  PRIVATE = 'PRIVATE',
}

export enum ActivityCategory {
  SPORTS = 'SPORTS',
  SOCIAL = 'SOCIAL',
  ADVENTURE = 'ADVENTURE',
  FUN = 'FUN',
  CREATIVE = 'CREATIVE',
  ENTERTAINMENT = 'ENTERTAINMENT',
}

export enum ActivityType {
  OPEN = 'OPEN',
  REQUEST = 'REQUEST',
}

export enum ParticipantStatus {
  JOINED = 'JOINED',
  LEFT = 'LEFT',
  REMOVED = 'REMOVED',
  PENDING = 'PENDING',
  REJECTED = 'REJECTED',
}
