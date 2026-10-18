import type { Candidate, Mode, SchoolId } from '../types/api'

export type OutreachStatus = 'not_sent' | 'sent' | 'replied' | 'meeting' | 'declined' | 'no_response'

export const STATUS_LABEL: Record<OutreachStatus, string> = {
  not_sent: 'Not sent yet',
  sent: 'Sent',
  replied: 'Replied',
  meeting: 'Meeting scheduled',
  declined: 'Declined',
  no_response: 'No response',
}

export const STATUSES = Object.keys(STATUS_LABEL) as OutreachStatus[]

export interface OutreachRecord {
  id: string
  candidateId: string
  mode: Mode
  name: string
  schoolId: SchoolId
  lab: string | null
  sourceUrl: string | null
  subject: string
  body: string
  status: OutreachStatus
  sentOn: string | null // YYYY-MM-DD
  followUpOn: string | null // YYYY-MM-DD
  notes: string
  createdAt: string
  updatedAt: string
}

export type RecordPatch = Partial<Pick<OutreachRecord, 'status' | 'sentOn' | 'followUpOn' | 'notes'>>

export const STORAGE_KEY = 'researchmatch.tracker.v1'

export function recordId(candidateId: string, mode: Mode): string {
  return `trk-${mode}-${candidateId}`
}

export function findRecord(records: OutreachRecord[], candidateId: string, mode: Mode): OutreachRecord | undefined {
  const id = recordId(candidateId, mode)
  return records.find((record) => record.id === id)
}

/** Creates a record for this candidate, or refreshes the saved email while keeping status, dates and notes. */
export function saveDraft(
  records: OutreachRecord[],
  candidate: Candidate,
  email: { subject: string; body: string },
  now: string,
): { records: OutreachRecord[]; created: boolean } {
  const id = recordId(candidate.id, candidate.mode)
  const existing = records.find((record) => record.id === id)
  if (existing) {
    const updated = { ...existing, subject: email.subject, body: email.body, updatedAt: now }
    return { records: records.map((record) => (record.id === id ? updated : record)), created: false }
  }
  const record: OutreachRecord = {
    id,
    candidateId: candidate.id,
    mode: candidate.mode,
    name: candidate.name,
    schoolId: candidate.schoolId,
    lab: candidate.lab && candidate.lab !== candidate.name ? candidate.lab : null,
    sourceUrl: candidate.sources.find((source) => source.url)?.url ?? null,
    subject: email.subject,
    body: email.body,
    status: 'not_sent',
    sentOn: null,
    followUpOn: null,
    notes: '',
    createdAt: now,
    updatedAt: now,
  }
  return { records: [record, ...records], created: true }
}

/** Marking a record as sent fills in today's date if no sent date was entered. */
export function updateRecord(records: OutreachRecord[], id: string, patch: RecordPatch, now: string): OutreachRecord[] {
  return records.map((record) => {
    if (record.id !== id) return record
    const next = { ...record, ...patch, updatedAt: now }
    if (patch.status === 'sent' && !next.sentOn) next.sentOn = now.slice(0, 10)
    return next
  })
}

export function removeRecord(records: OutreachRecord[], id: string): OutreachRecord[] {
  return records.filter((record) => record.id !== id)
}

/** A follow-up is due when its date has arrived and the professor hasn't answered yet. */
export function followUpDue(record: OutreachRecord, today: string): boolean {
  return Boolean(record.followUpOn && record.followUpOn <= today && (record.status === 'sent' || record.status === 'no_response'))
}

export function todayIso(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

function isRecord(value: unknown): value is OutreachRecord {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  const optionalDate = (v: unknown) => v === null || (typeof v === 'string' && DATE.test(v))
  return (
    typeof r.id === 'string' &&
    typeof r.candidateId === 'string' &&
    (r.mode === 'live' || r.mode === 'demo' || r.mode === 'cached') &&
    typeof r.name === 'string' &&
    (r.schoolId === 'cmu' || r.schoolId === 'stanford' || r.schoolId === 'uw') &&
    (r.lab === null || typeof r.lab === 'string') &&
    (r.sourceUrl === null || (typeof r.sourceUrl === 'string' && /^https?:\/\//.test(r.sourceUrl))) &&
    typeof r.subject === 'string' &&
    typeof r.body === 'string' &&
    STATUSES.includes(r.status as OutreachStatus) &&
    optionalDate(r.sentOn) &&
    optionalDate(r.followUpOn) &&
    typeof r.notes === 'string' &&
    typeof r.createdAt === 'string' &&
    typeof r.updatedAt === 'string'
  )
}

/** Unreadable or tampered entries are skipped rather than breaking the page. */
export function parseRecords(raw: string | null): OutreachRecord[] {
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value) ? value.filter(isRecord) : []
  } catch {
    return []
  }
}

export function toCsv(records: OutreachRecord[], schoolName: (id: SchoolId) => string): string {
  const header = ['Name', 'University', 'Lab', 'Status', 'Sent on', 'Follow up by', 'Subject', 'Notes', 'Source', 'Sample']
  const escape = (value: string) => {
    // Leading formula characters are neutralized so spreadsheets don't execute them.
    const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const rows = records.map((record) =>
    [
      record.name,
      schoolName(record.schoolId),
      record.lab ?? '',
      STATUS_LABEL[record.status],
      record.sentOn ?? '',
      record.followUpOn ?? '',
      record.subject,
      record.notes,
      record.sourceUrl ?? '',
      record.mode === 'demo' ? 'yes' : 'no',
    ]
      .map(escape)
      .join(','),
  )
  return [header.join(','), ...rows].join('\r\n')
}
