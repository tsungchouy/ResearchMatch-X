import type { Profile } from '../types/api'

export type FieldErrors = Record<string, string>

/** Returns field errors and the element IDs to focus, in page order. */
export function validateProfile(profile: Profile): { errors: FieldErrors; order: string[] } {
  const errors: FieldErrors = {}
  const order: string[] = []
  if (!profile.name?.trim()) {
    errors.name = 'Add your name.'
    order.push('profile-name')
  }
  for (const exp of profile.experiences) {
    if (!exp.title.trim()) {
      errors[`exp-${exp.id}-title`] = 'Add a short title, or remove this experience.'
      order.push(`exp-${exp.id}-title`)
    }
  }
  const interests = profile.preferences.interests
  if (interests.length < 1) {
    errors.interests = 'Add at least one research interest.'
    order.push('pref-interests')
  } else if (interests.length > 5 || interests.some((term) => term.trim().length < 2 || term.trim().length > 80)) {
    errors.interests = 'Use 1–5 interests of 2–80 characters each.'
    order.push('pref-interests')
  }
  if (profile.preferences.schools.length < 1) {
    errors.schools = 'Choose at least one university.'
    order.push('pref-schools')
  }
  const { startMonth, endMonth } = profile.preferences
  if (startMonth && endMonth && endMonth < startMonth) {
    errors.endMonth = 'The end month can’t be earlier than the start month.'
    order.push('pref-end')
  }
  if (profile.preferences.additional.length > 500) {
    errors.additional = 'Keep additional preferences under 500 characters.'
    order.push('pref-additional')
  }
  return { errors, order }
}

export function cleanProfile(profile: Profile): Profile {
  const trim = (value: string | null) => (value && value.trim() ? value.trim() : null)
  return {
    ...profile,
    name: trim(profile.name),
    institution: trim(profile.institution),
    degreeYear: trim(profile.degreeYear),
    major: trim(profile.major),
    experiences: profile.experiences.map((exp) => ({ ...exp, title: exp.title.trim(), description: exp.description.trim() })),
    preferences: { ...profile.preferences, interests: profile.preferences.interests.map((term) => term.trim()) },
  }
}
