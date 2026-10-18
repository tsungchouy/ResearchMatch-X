import type { Candidate, FitLevel, Recruitment } from '../types/api'

export const RECRUITMENT_LABEL: Record<Recruitment, string> = {
  recruiting_stated: 'Recruiting stated',
  closed_stated: 'Closed stated',
  unknown: 'Recruiting unknown',
}

export const FIT_LABEL: Record<FitLevel, string> = {
  strong: 'Strong research fit',
  partial: 'Partial research fit',
  insufficient_evidence: 'Not enough evidence',
}

export function citationNumbers(candidate: Candidate): Map<string, number> {
  return new Map(candidate.sources.map((source, index) => [source.id, index + 1]))
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Unknown'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'Unknown'
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function safeFileName(candidateId: string): string {
  return `outreach-${candidateId.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 80)}.txt`
}

export function emailText(subject: string, body: string): string {
  return `Subject: ${subject}\n\n${body}`
}

export const MAX_PDF_BYTES = 5 * 1024 * 1024

export function validatePdf(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) return 'Choose a PDF file. Other file types can’t be read.'
  if (file.size > MAX_PDF_BYTES) return 'This PDF is larger than 5 MB. Choose a smaller file or paste text instead.'
  if (file.size === 0) return 'This file is empty.'
  return null
}
