import { describe, expect, it } from 'vitest'
import type { Candidate } from '../types/api'
import { findRecord, followUpDue, parseRecords, removeRecord, saveDraft, toCsv, updateRecord } from './tracker'

const candidate: Candidate = {
  id: 'cand-cmu-1',
  schoolId: 'cmu',
  name: 'Prof. Ada Example',
  entityType: 'faculty',
  lab: 'Example Lab',
  researchSummary: 'Studies examples.',
  fitLevel: 'strong',
  fitReasons: [],
  recruitment: 'unknown',
  recruitmentExplanation: 'No statement found.',
  recruitmentSourceIds: [],
  unknowns: [],
  sources: [
    { id: 's1', title: 'Sample', url: null, domain: null, summary: '', retrievedAt: '', publishedAt: null, sample: true },
    { id: 's2', title: 'Faculty page', url: 'https://www.cs.cmu.edu/~ada', domain: 'cs.cmu.edu', summary: '', retrievedAt: '', publishedAt: null, sample: false },
  ],
  mode: 'live',
}

const T1 = '2026-10-01T12:00:00.000Z'
const T2 = '2026-10-05T12:00:00.000Z'

describe('tracker records', () => {
  it('creates a record with the first real source and no status yet', () => {
    const { records, created } = saveDraft([], candidate, { subject: 'Hello', body: 'Body' }, T1)
    expect(created).toBe(true)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      candidateId: 'cand-cmu-1',
      name: 'Prof. Ada Example',
      lab: 'Example Lab',
      sourceUrl: 'https://www.cs.cmu.edu/~ada',
      status: 'not_sent',
      sentOn: null,
      notes: '',
    })
  })

  it('saving again updates the email but keeps status, dates and notes', () => {
    let records = saveDraft([], candidate, { subject: 'Hello', body: 'Body' }, T1).records
    records = updateRecord(records, records[0].id, { status: 'sent', notes: 'Emailed from school account' }, T1)
    const result = saveDraft(records, candidate, { subject: 'Hello again', body: 'New body' }, T2)
    expect(result.created).toBe(false)
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      subject: 'Hello again',
      body: 'New body',
      status: 'sent',
      sentOn: '2026-10-01',
      notes: 'Emailed from school account',
      createdAt: T1,
      updatedAt: T2,
    })
  })

  it('keeps demo and live records for the same candidate apart', () => {
    let records = saveDraft([], candidate, { subject: 'a', body: 'b' }, T1).records
    records = saveDraft(records, { ...candidate, mode: 'demo' }, { subject: 'a', body: 'b' }, T1).records
    expect(records).toHaveLength(2)
    expect(findRecord(records, candidate.id, 'demo')?.mode).toBe('demo')
  })

  it('marking as sent fills today only when no date was entered', () => {
    let records = saveDraft([], candidate, { subject: 'a', body: 'b' }, T1).records
    const id = records[0].id
    records = updateRecord(records, id, { sentOn: '2026-09-30' }, T1)
    records = updateRecord(records, id, { status: 'sent' }, T2)
    expect(records[0].sentOn).toBe('2026-09-30')
    expect(removeRecord(records, id)).toEqual([])
  })

  it('flags follow-ups that are due only while waiting for a reply', () => {
    const base = saveDraft([], candidate, { subject: 'a', body: 'b' }, T1).records[0]
    expect(followUpDue({ ...base, status: 'sent', followUpOn: '2026-10-10' }, '2026-10-10')).toBe(true)
    expect(followUpDue({ ...base, status: 'sent', followUpOn: '2026-10-11' }, '2026-10-10')).toBe(false)
    expect(followUpDue({ ...base, status: 'replied', followUpOn: '2026-10-01' }, '2026-10-10')).toBe(false)
    expect(followUpDue({ ...base, status: 'sent', followUpOn: null }, '2026-10-10')).toBe(false)
  })
})

describe('tracker storage parsing', () => {
  it('returns nothing for missing or broken storage', () => {
    expect(parseRecords(null)).toEqual([])
    expect(parseRecords('{not json')).toEqual([])
    expect(parseRecords('{"a":1}')).toEqual([])
  })

  it('skips invalid entries, including unsafe source URLs', () => {
    const good = saveDraft([], candidate, { subject: 'a', body: 'b' }, T1).records[0]
    const raw = JSON.stringify([good, { ...good, id: 'x', status: 'ghosted' }, { ...good, id: 'y', sourceUrl: 'javascript:alert(1)' }, 42])
    expect(parseRecords(raw)).toEqual([good])
  })
})

describe('tracker CSV export', () => {
  it('quotes commas and neutralizes spreadsheet formulas', () => {
    const records = updateRecord(
      saveDraft([], candidate, { subject: 'Hi, there', body: 'b' }, T1).records,
      'trk-live-cand-cmu-1',
      { notes: '=HYPERLINK("x")' },
      T1,
    )
    const csv = toCsv(records, () => 'Carnegie Mellon University')
    const [header, row] = csv.split('\r\n')
    expect(header).toBe('Name,University,Lab,Status,Sent on,Follow up by,Subject,Notes,Source,Sample')
    expect(row).toContain('"Hi, there"')
    expect(row).toContain(`"'=HYPERLINK(""x"")"`)
    expect(row.endsWith('https://www.cs.cmu.edu/~ada,no')).toBe(true)
  })
})
