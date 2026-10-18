import type { ApiErrorBody, Candidate, DraftRequest, EmailDraft, Profile, SchoolId, SearchJob } from '../types/api'

export type ResumeInput = { kind: 'pdf'; file: File } | { kind: 'text'; text: string }

export interface Service {
  readonly mode: 'live' | 'demo'
  extractProfile(input: ResumeInput): Promise<Profile>
  confirmProfile(profile: Profile): Promise<Profile>
  startSearch(profile: Profile, key: string): Promise<{ jobId: string }>
  getSearch(jobId: string): Promise<SearchJob>
  cancelSearch(jobId: string): Promise<SearchJob>
  retrySearch(jobId: string, schoolIds: SchoolId[], key: string): Promise<{ jobId: string }>
  generateDraft(request: DraftRequest, key: string, candidate: Candidate, profile: Profile): Promise<EmailDraft>
}

export class ApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(body: ApiErrorBody, status = 0) {
    super(body.message)
    this.code = body.code
    this.retryable = body.retryable
    this.status = status
  }

  toBody(): ApiErrorBody {
    return { code: this.code, message: this.message, retryable: this.retryable }
  }
}

export function toErrorBody(error: unknown): ApiErrorBody {
  if (error instanceof ApiError) return error.toBody()
  return {
    code: 'NETWORK_ERROR',
    message: "We couldn't reach the server. Check your connection and try again.",
    retryable: true,
  }
}

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}

/** 128-bit random session identifier, kept in memory only. */
export function createSessionId(): string {
  return randomHex(16)
}

export function createRequestKey(): string {
  return randomHex(16)
}

export interface Health {
  reachable: boolean
  liveConfigured: boolean
}

/** Empty for same-origin deployments; set VITE_API_BASE_URL at build time when the API lives elsewhere. */
export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export async function fetchHealth(): Promise<Health> {
  try {
    const response = await fetch(`${API_BASE}/api/health`)
    if (!response.ok) return { reachable: false, liveConfigured: false }
    const body = (await response.json()) as { status: string; liveConfigured: boolean }
    return { reachable: true, liveConfigured: Boolean(body.liveConfigured) }
  } catch {
    return { reachable: false, liveConfigured: false }
  }
}
