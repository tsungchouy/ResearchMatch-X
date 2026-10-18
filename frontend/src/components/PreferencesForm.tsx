import { useMemo } from 'react'
import { formatMonth } from '../state/reducer'
import { SCHOOLS, type Arrangement, type Preferences, type SchoolId } from '../types/api'
import { ChipInput } from './ChipInput'
import type { FieldErrors } from '../lib/validation'

const EXAMPLES = ['HCI', 'Machine learning', 'Robotics']

function upcomingMonths(count = 24): string[] {
  const now = new Date()
  const months: string[] = []
  for (let i = 0; i < count; i += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1)
    months.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`)
  }
  return months
}

interface PreferencesFormProps {
  preferences: Preferences
  onChange: (preferences: Preferences) => void
  errors: FieldErrors
}

export function PreferencesForm({ preferences, onChange, errors }: PreferencesFormProps) {
  const months = useMemo(() => {
    const list = upcomingMonths()
    for (const value of [preferences.startMonth, preferences.endMonth]) {
      if (value && !list.includes(value)) list.unshift(value)
    }
    return list.sort()
  }, [preferences.startMonth, preferences.endMonth])

  function update(patch: Partial<Preferences>) {
    onChange({ ...preferences, ...patch })
  }

  function toggleSchool(id: SchoolId, checked: boolean) {
    const next = checked ? [...preferences.schools, id] : preferences.schools.filter((school) => school !== id)
    update({ schools: SCHOOLS.map((school) => school.id).filter((schoolId) => next.includes(schoolId)) })
  }

  const unusedExamples = EXAMPLES.filter(
    (example) => !preferences.interests.some((interest) => interest.toLowerCase() === example.toLowerCase()),
  )

  return (
    <section className="section section--ruled" aria-labelledby="preferences-heading">
      <h2 id="preferences-heading" className="section__title">
        Research preferences
      </h2>

      <ChipInput
        id="pref-interests"
        label="Research interests"
        values={preferences.interests}
        onChange={(interests) => update({ interests })}
        max={5}
        minLength={2}
        maxLength={80}
        hint="1–5 topics. Type one and press Enter."
        error={errors.interests}
      />
      {unusedExamples.length > 0 && preferences.interests.length < 5 && (
        <div className="examples">
          <span className="examples__label">Examples:</span>
          {unusedExamples.map((example) => (
            <button
              key={example}
              type="button"
              className="btn-chip"
              onClick={() => update({ interests: [...preferences.interests, example] })}
            >
              <span className="visually-hidden">Add </span>
              {example}
            </button>
          ))}
        </div>
      )}

      <fieldset className="fieldset" aria-describedby={errors.schools ? 'pref-schools-error' : undefined}>
        <legend className="field__label">Universities</legend>
        <div className="check-rows">
          {SCHOOLS.map((school, index) => (
            <label key={school.id} className="check-row">
              <input
                type="checkbox"
                id={index === 0 ? 'pref-schools' : undefined}
                checked={preferences.schools.includes(school.id)}
                onChange={(event) => toggleSchool(school.id, event.target.checked)}
              />
              <span>
                {school.name}
                <span className="check-row__meta">{school.domain}</span>
              </span>
            </label>
          ))}
        </div>
        {errors.schools && (
          <p id="pref-schools-error" className="field-error">
            {errors.schools}
          </p>
        )}
      </fieldset>

      <fieldset className="fieldset">
        <legend className="field__label">Availability</legend>
        <div className="form-grid">
          <div className="field">
            <label className="field__label field__label--sub" htmlFor="pref-start">
              Start month
            </label>
            <select
              id="pref-start"
              className="select"
              value={preferences.startMonth ?? ''}
              onChange={(event) => update({ startMonth: event.target.value || null })}
            >
              <option value="">Not sure yet</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label field__label--sub" htmlFor="pref-end">
              End month
            </label>
            <select
              id="pref-end"
              className={`select${errors.endMonth ? ' has-error' : ''}`}
              value={preferences.endMonth ?? ''}
              aria-invalid={errors.endMonth ? true : undefined}
              aria-describedby={errors.endMonth ? 'pref-end-error' : undefined}
              onChange={(event) => update({ endMonth: event.target.value || null })}
            >
              <option value="">Not sure yet</option>
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatMonth(month)}
                </option>
              ))}
            </select>
            {errors.endMonth && (
              <p id="pref-end-error" className="field-error">
                {errors.endMonth}
              </p>
            )}
          </div>
        </div>
      </fieldset>

      <div className="field field--narrow">
        <label className="field__label" htmlFor="pref-arrangement">
          Work arrangement
        </label>
        <select
          id="pref-arrangement"
          className="select"
          value={preferences.arrangement}
          onChange={(event) => update({ arrangement: event.target.value as Arrangement })}
        >
          <option value="any">No preference</option>
          <option value="onsite">On-site</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pref-additional">
          Additional preferences
        </label>
        <p className="field__hint" id="pref-additional-hint">
          Optional
        </p>
        <textarea
          id="pref-additional"
          className={`textarea${errors.additional ? ' has-error' : ''}`}
          value={preferences.additional}
          maxLength={500}
          aria-describedby="pref-additional-hint pref-additional-count"
          onChange={(event) => update({ additional: event.target.value })}
        />
        <p id="pref-additional-count" className="field__count">
          {preferences.additional.length} / 500
        </p>
      </div>
    </section>
  )
}
