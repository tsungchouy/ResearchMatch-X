import type { DraftRequest, EmailDraft, Profile, SchoolId, SearchJob } from '../types/api'
import { API_BASE, ApiError, type ResumeInput, type Service } from './client'

/** Talks to the FastAPI backend. Never substitutes sample data on failure. */
export function createLiveService(sessionId: string): Service {
  async function request<T>(path: string, init: RequestInit & { key?: string } = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('X-Session-ID', sessionId)
    if (init.key) headers.set('Idempotency-Key', init.key)
    if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
    let response: Response
    try {
      response = await fetch(`${API_BASE}${path}`, { ...init, headers })
    } catch {
      throw new ApiError(
        { code: 'NETWORK_ERROR', message: "We couldn't reach the server. Check your connection and try again.", retryable: true },
        0,
      )
    }
    const text = await response.text()
    let body: unknown = null
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      body = null
    }
    if (!response.ok) {
      const error = (body as { error?: { code: string; message: string; retryable: boolean } } | null)?.error
      throw new ApiError(
        error ?? { code: 'HTTP_ERROR', message: 'Something went wrong. Try again.', retryable: response.status >= 500 },
        response.status,
      )
    }
    return body as T
  }

  return {
    mode: 'live',
    extractProfile(input: ResumeInput) {
      const form = new FormData()
      if (input.kind === 'pdf') form.append('file', input.file)
      else form.append('text', input.text)
      return request<Profile>('/api/profile/extract', { method: 'POST', body: form })
    },
    confirmProfile(profile: Profile) {
      return request<Profile>('/api/profile/confirm', { method: 'POST', body: JSON.stringify(profile) })
    },
    startSearch(profile: Profile, key: string) {
      return request<{ jobId: string }>('/api/search', {
        method: 'POST',
        key,
        body: JSON.stringify({ profileId: profile.id, profileVersion: profile.version }),
      })
    },
    getSearch(jobId: string) {
      return request<SearchJob>(`/api/search/${encodeURIComponent(jobId)}`)
    },
    cancelSearch(jobId: string) {
      return request<SearchJob>(`/api/search/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' })
    },
    retrySearch(jobId: string, schoolIds: SchoolId[], key: string) {
      return request<{ jobId: string }>(`/api/search/${encodeURIComponent(jobId)}/retry`, {
        method: 'POST',
        key,
        body: JSON.stringify({ schoolIds }),
      })
    },
    generateDraft(draftRequest: DraftRequest, key: string): Promise<EmailDraft> {
      return request<EmailDraft>('/api/draft', { method: 'POST', key, body: JSON.stringify(draftRequest) })
    },
  }
}
