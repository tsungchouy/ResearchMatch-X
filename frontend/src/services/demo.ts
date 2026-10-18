import { presetProfile, sampleCandidates, type PresetId } from '../fixtures/demo'
import {
  schoolName,
  type Candidate,
  type DraftRequest,
  type EmailDraft,
  type Profile,
  type SchoolId,
  type SearchJob,
} from '../types/api'
import { ApiError, type ResumeInput, type Service } from './client'

/** Test-only switches, set by Playwright through `window.__researchmatchTestHooks`. */
export interface DemoTestHooks {
  failSchools?: SchoolId[]
  failDraft?: boolean
  stepMs?: number
}

declare global {
  interface Window {
    __researchmatchTestHooks?: DemoTestHooks
  }
}

function hooks(): DemoTestHooks {
  return (typeof window !== 'undefined' && window.__researchmatchTestHooks) || {}
}

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

interface DemoJob {
  job: SearchJob
  timers: ReturnType<typeof setTimeout>[]
  bySchool: Partial<Record<SchoolId, Candidate[]>>
}

/**
 * Sample-data adapter with the same interface as the live service. Searches are simulated
 * step by step so the progress states are visible; results always come from the selected preset.
 */
export function createDemoService(preset: PresetId): Service {
  const jobs = new Map<string, DemoJob>()
  const confirmed = new Map<string, Profile>()
  const keyed = new Map<string, Promise<unknown>>()

  function once<T>(key: string, produce: () => Promise<T>): Promise<T> {
    const existing = keyed.get(key)
    if (existing) return existing as Promise<T>
    const promise = produce()
    keyed.set(key, promise)
    promise.catch(() => keyed.delete(key))
    return promise
  }

  function run(entry: DemoJob, profile: Profile) {
    const step = hooks().stepMs ?? 900
    const pending = entry.job.schools.filter((school) => school.status === 'pending')
    pending.forEach((progress, index) => {
      entry.timers.push(
        setTimeout(() => {
          entry.job.status = 'searching'
          entry.job.currentSchoolId = progress.schoolId
          progress.status = 'searching'
        }, index * step),
        setTimeout(() => {
          if (hooks().failSchools?.includes(progress.schoolId)) {
            progress.status = 'failed'
            progress.errorCode = 'SEARCH_TIMEOUT'
            progress.errorMessage = 'Search took too long. Try again.'
            return
          }
          entry.bySchool[progress.schoolId] = sampleCandidates(
            preset,
            [progress.schoolId],
            profile.experiences.map((exp) => exp.id),
            nowIso(),
          )
          progress.status = 'complete'
        }, (index + 1) * step),
      )
    })
    entry.timers.push(
      setTimeout(() => {
        entry.job.status = 'organizing'
        entry.job.currentSchoolId = null
      }, pending.length * step + 50),
      setTimeout(() => {
        const job = entry.job
        const schools = job.schools.map((school) => school.schoolId).filter((id) => entry.bySchool[id])
        job.candidates = sampleCandidates(
          preset,
          schools,
          profile.experiences.map((exp) => exp.id),
          nowIso(),
        )
        job.retrievedAt = nowIso()
        const statuses = job.schools.map((school) => school.status)
        job.status = statuses.every((s) => s === 'failed')
          ? 'failed'
          : statuses.some((s) => s === 'failed')
            ? 'partial'
            : 'complete'
      }, pending.length * step + 600),
    )
  }

  function snapshot(entry: DemoJob): SearchJob {
    return structuredClone(entry.job)
  }

  function getEntry(jobId: string): DemoJob {
    const entry = jobs.get(jobId)
    if (!entry) {
      throw new ApiError({ code: 'JOB_NOT_FOUND', message: 'This search is no longer available.', retryable: false }, 404)
    }
    return entry
  }

  return {
    mode: 'demo',
    async extractProfile(_input: ResumeInput) {
      await wait(400)
      return presetProfile(preset, randomId('demo-prof'))
    },
    async confirmProfile(profile: Profile) {
      await wait(150)
      const previous = confirmed.get(profile.id)
      const next: Profile = structuredClone({ ...profile, version: (previous?.version ?? 0) + 1, confirmed: true })
      confirmed.set(next.id, next)
      return next
    },
    startSearch(profile: Profile, key: string) {
      return once(`search:${key}`, async () => {
        const current = confirmed.get(profile.id)
        if (!current || current.version !== profile.version) {
          throw new ApiError({ code: 'PROFILE_VERSION_MISMATCH', message: 'Your profile changed.', retryable: false }, 409)
        }
        const entry: DemoJob = {
          job: {
            id: randomId('demo-job'),
            status: 'queued',
            profileId: current.id,
            profileVersion: current.version,
            schools: current.preferences.schools.map((id) => ({
              schoolId: id,
              name: schoolName(id),
              status: 'pending',
              errorCode: null,
              errorMessage: null,
            })),
            currentSchoolId: null,
            candidates: [],
            warnings: [],
            createdAt: nowIso(),
            retrievedAt: null,
            retryOf: null,
            mode: 'demo',
          },
          timers: [],
          bySchool: {},
        }
        jobs.set(entry.job.id, entry)
        run(entry, current)
        return { jobId: entry.job.id }
      })
    },
    async getSearch(jobId: string) {
      return snapshot(getEntry(jobId))
    },
    async cancelSearch(jobId: string) {
      const entry = getEntry(jobId)
      entry.timers.forEach(clearTimeout)
      if (!['complete', 'partial', 'failed'].includes(entry.job.status)) {
        entry.job.status = 'cancelled'
        entry.job.currentSchoolId = null
      }
      return snapshot(entry)
    },
    retrySearch(jobId: string, schoolIds: SchoolId[], key: string) {
      return once(`retry:${key}`, async () => {
        const original = getEntry(jobId)
        const profile = confirmed.get(original.job.profileId)
        if (!profile) throw new ApiError({ code: 'PROFILE_NOT_CONFIRMED', message: 'Confirm your profile.', retryable: false }, 409)
        const job = structuredClone(original.job)
        job.id = randomId('demo-job')
        job.retryOf = original.job.id
        job.status = 'queued'
        job.retrievedAt = null
        job.schools.forEach((school) => {
          if (schoolIds.includes(school.schoolId)) {
            school.status = 'pending'
            school.errorCode = null
            school.errorMessage = null
          }
        })
        const entry: DemoJob = { job, timers: [], bySchool: { ...original.bySchool } }
        jobs.set(job.id, entry)
        run(entry, profile)
        return { jobId: job.id }
      })
    },
    generateDraft(request: DraftRequest, key: string, candidate: Candidate, profile: Profile) {
      return once(`draft:${key}`, async () => {
        await wait(hooks().stepMs ? 100 : 700)
        if (hooks().failDraft) {
          throw new ApiError({ code: 'PROVIDER_ERROR', message: 'The sample writer hit a simulated error. Try again.', retryable: true }, 502)
        }
        if (!request.reviewConfirmed) {
          throw new ApiError({ code: 'REVIEW_REQUIRED', message: 'Review the match first.', retryable: false }, 409)
        }
        return sampleDraft(request, candidate, profile)
      })
    },
  }
}

function lastName(name: string): string {
  const parts = name.replace(/^(Prof\.|Dr\.)\s*/, '').trim().split(/\s+/)
  return parts[parts.length - 1] ?? name
}

/** Deterministic template so the Demo can show the whole flow without a model. */
export function sampleDraft(request: DraftRequest, candidate: Candidate, profile: Profile): EmailDraft {
  const greeting =
    candidate.entityType === 'lab' ? `Dear ${candidate.name.replace(' (sample)', '')} team,` : `Dear Professor ${lastName(candidate.name)},`
  const student = profile.major ? `${/^[aeiou]/i.test(profile.major) ? 'an' : 'a'} ${profile.major} student` : 'an undergraduate student'
  const where = profile.institution ? ` at ${profile.institution}` : ''
  const year = profile.degreeYear ? ` (${profile.degreeYear})` : ''
  const intro = `I am ${student}${where}${year}, and I am interested in ${profile.preferences.interests.join(' and ').toLowerCase()}.`
  const topic = candidate.researchSummary.replace(/\.$/, '')
  const connection = `I was drawn to your work because it ${topic.charAt(0).toLowerCase()}${topic.slice(1)}.`
  const selected = profile.experiences.filter((exp) => request.selectedExperienceIds.includes(exp.id))
  const experience = selected.length
    ? `Relevant to this, ${selected.map((exp) => `I worked as part of “${exp.title}”: ${exp.description.replace(/\.$/, '')}`).join('. Also, ')}.`
    : 'My coursework so far has made me eager to learn how research in this area is done.'
  const ask = request.userRequest
    ? request.userRequest
    : 'I would be grateful to know whether there might be a way for an undergraduate to get involved.'
  const availability = request.availability ? `I am available ${request.availability}.` : ''
  const signature = request.signatureName || '[Your name]'
  const body = [
    greeting,
    '',
    [intro, connection].join(' '),
    '',
    experience,
    '',
    [ask, availability].filter(Boolean).join(' '),
    '',
    'Thank you for your time and consideration.',
    '',
    'Best regards,',
    signature,
  ].join('\n')
  return {
    id: randomId('demo-draft'),
    candidateId: candidate.id,
    profileVersion: request.profileVersion,
    subject: `Undergraduate interest in ${profile.preferences.interests[0] ?? 'your research'}`,
    body,
    createdAt: nowIso(),
    mode: 'demo',
  }
}
