export type Mode = 'live' | 'demo' | 'cached'
export type Recruitment = 'recruiting_stated' | 'closed_stated' | 'unknown'
export type FitLevel = 'strong' | 'partial' | 'insufficient_evidence'
export type SchoolId = 'cmu' | 'stanford' | 'uw'
export type Arrangement = 'any' | 'onsite' | 'remote' | 'hybrid'

export interface Experience {
  id: string
  title: string
  description: string
}

export interface Preferences {
  interests: string[]
  schools: SchoolId[]
  startMonth: string | null // YYYY-MM
  endMonth: string | null
  arrangement: Arrangement
  additional: string
}

export interface Profile {
  id: string
  version: number
  name: string | null
  institution: string | null
  degreeYear: string | null
  major: string | null
  skills: string[]
  experiences: Experience[]
  preferences: Preferences
  confirmed: boolean
}

export interface Source {
  id: string
  title: string
  url: string | null // null only for demo samples; live sources always have a URL
  domain: string | null
  summary: string // paraphrase, not a verbatim quote
  retrievedAt: string
  publishedAt: string | null
  sample: boolean
}

export interface FitReason {
  text: string
  experienceIds: string[]
  interestTerms: string[]
  sourceIds: string[]
}

export interface Candidate {
  id: string
  schoolId: SchoolId
  name: string
  entityType: 'faculty' | 'lab'
  lab: string | null
  researchSummary: string
  fitLevel: FitLevel
  fitReasons: FitReason[]
  recruitment: Recruitment
  recruitmentExplanation: string
  recruitmentSourceIds: string[]
  unknowns: string[]
  sources: Source[]
  mode: Mode
}

export interface EmailDraft {
  id: string
  candidateId: string
  profileVersion: number
  subject: string
  body: string
  createdAt: string
  mode: Mode
}

export type JobStatus = 'queued' | 'searching' | 'organizing' | 'complete' | 'partial' | 'failed' | 'cancelled'
export type SchoolStatus = 'pending' | 'searching' | 'complete' | 'failed'

export interface SchoolProgress {
  schoolId: SchoolId
  name: string
  status: SchoolStatus
  errorCode: string | null
  errorMessage: string | null
}

export interface SearchJob {
  id: string
  status: JobStatus
  profileId: string
  profileVersion: number
  schools: SchoolProgress[]
  currentSchoolId: SchoolId | null
  candidates: Candidate[]
  warnings: string[]
  createdAt: string
  retrievedAt: string | null
  retryOf: string | null
  mode: Mode
}

export interface DraftRequest {
  profileId: string
  profileVersion: number
  jobId: string
  candidateId: string
  selectedExperienceIds: string[]
  educationOnly: boolean
  userRequest: string
  signatureName: string
  availability: string
  reviewConfirmed: boolean
}

export interface ApiErrorBody {
  code: string
  message: string
  retryable: boolean
  requestId?: string
}

export const TERMINAL_STATUSES: JobStatus[] = ['complete', 'partial', 'failed', 'cancelled']

export const SCHOOLS: { id: SchoolId; name: string; domain: string }[] = [
  { id: 'cmu', name: 'Carnegie Mellon University', domain: 'cmu.edu' },
  { id: 'stanford', name: 'Stanford University', domain: 'stanford.edu' },
  { id: 'uw', name: 'University of Washington', domain: 'washington.edu' },
]

export function schoolName(id: SchoolId): string {
  return SCHOOLS.find((school) => school.id === id)?.name ?? id
}
