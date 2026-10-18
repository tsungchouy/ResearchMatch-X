import { beforeEach, describe, expect, it } from 'vitest'
import { presetProfile, sampleCandidates } from '../fixtures/demo'
import type { EmailDraft, SearchJob } from '../types/api'
import { initialState, type AppState } from './reducer'
import { loadSession, saveSession, SESSION_STORAGE_KEY } from './sessionPersistence'

const sessionId = 'a'.repeat(32)

function completeState(): AppState {
  const profile = { ...presetProfile('hci', 'profile-1'), version: 1, confirmed: true }
  const candidate = sampleCandidates('hci', ['cmu'], [profile.experiences[0].id], '2026-10-18T00:00:00Z')[0]
  const job: SearchJob = {
    id: 'job-1',
    status: 'complete',
    profileId: profile.id,
    profileVersion: 1,
    schools: [{ schoolId: 'cmu', name: 'Carnegie Mellon University', status: 'complete', errorCode: null, errorMessage: null }],
    currentSchoolId: null,
    candidates: [candidate],
    warnings: [],
    createdAt: '2026-10-18T00:00:00Z',
    retrievedAt: '2026-10-18T00:00:01Z',
    retryOf: null,
    mode: 'demo',
  }
  const email: EmailDraft = {
    id: 'draft-1',
    candidateId: candidate.id,
    profileVersion: 1,
    subject: 'Research',
    body: 'Edited email body',
    createdAt: '2026-10-18T00:00:02Z',
    mode: 'demo',
  }
  return {
    ...initialState(sessionId),
    mode: 'demo',
    demoPreset: 'hci',
    health: { checked: true, reachable: true, liveConfigured: true },
    resume: { tab: 'pdf', file: new File(['resume'], 'resume.pdf', { type: 'application/pdf' }), text: '' },
    profileDraft: profile,
    confirmedProfile: profile,
    reviewChecked: true,
    search: {
      jobId: job.id,
      profileId: profile.id,
      profileVersion: 1,
      mode: 'demo',
      job,
      previousJob: null,
      error: null,
    },
    selection: { candidateId: candidate.id, jobId: job.id, reviewConfirmed: true },
    outreach: {
      selectedExperienceIds: [profile.experiences[0].id],
      educationOnly: false,
      userRequest: 'Can I join?',
      signatureName: 'Jordan',
      availability: 'Summer',
      onlySelectedConfirmed: true,
    },
    draft: {
      email,
      subject: email.subject,
      body: email.body,
      edited: true,
      stale: false,
      status: 'loading',
      error: null,
      requestKey: 'pending',
    },
  }
}

describe('session persistence', () => {
  beforeEach(() => localStorage.clear())

  it('restores profile, results, selection and edited draft but not transient state or file bytes', () => {
    saveSession(completeState())
    const restored = loadSession()

    expect(restored?.sessionId).toBe(sessionId)
    expect(restored?.profileDraft?.name).toBe('Jordan Sample')
    expect(restored?.search?.job?.candidates).toHaveLength(1)
    expect(restored?.selection?.candidateId).toBeTruthy()
    expect(restored?.draft.body).toBe('Edited email body')
    expect(restored?.draft.edited).toBe(true)
    expect(restored?.draft.status).toBe('idle')
    expect(restored?.draft.requestKey).toBeNull()
    expect(restored?.resume.file).toBeNull()
    expect(restored?.health.checked).toBe(false)
  })

  it('ignores malformed or incompatible stored data', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{"version":999,"state":{}}')
    expect(loadSession()).toBeNull()
    localStorage.setItem(SESSION_STORAGE_KEY, '{bad json')
    expect(loadSession()).toBeNull()
  })

  it('removes storage after starting over to an empty live session', () => {
    saveSession(completeState())
    saveSession(initialState('b'.repeat(32)))
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })
})
