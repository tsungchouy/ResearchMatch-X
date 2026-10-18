import { RECRUITMENT_LABEL } from '../lib/format'
import type { Recruitment } from '../types/api'

export function RecruitmentBadge({ status }: { status: Recruitment }) {
  return <span className={`badge badge--${status.replace('_', '-')}`}>{RECRUITMENT_LABEL[status]}</span>
}
