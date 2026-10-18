import { forwardRef } from 'react'
import type { FieldErrors } from '../lib/validation'
import type { Experience, Profile } from '../types/api'
import { CharCount } from './CharCount'
import { ChipInput } from './ChipInput'

interface ProfileEditorProps {
  profile: Profile
  onChange: (profile: Profile) => void
  errors: FieldErrors
}

const MAX_EXPERIENCES = 8

function localId(): string {
  const values = new Uint8Array(6)
  crypto.getRandomValues(values)
  return `exp-local-${Array.from(values, (v) => v.toString(16).padStart(2, '0')).join('')}`
}

function TextField({
  id,
  label,
  value,
  onChange,
  maxLength = 200,
  required,
  error,
}: {
  id: string
  label: string
  value: string | null
  onChange: (value: string | null) => void
  maxLength?: number
  required?: boolean
  error?: string
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={`input${error ? ' has-error' : ''}`}
        value={value ?? ''}
        maxLength={maxLength}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}

export const ProfileEditor = forwardRef<HTMLHeadingElement, ProfileEditorProps>(function ProfileEditor(
  { profile, onChange, errors },
  headingRef,
) {
  function update(patch: Partial<Profile>) {
    onChange({ ...profile, ...patch })
  }

  function updateExperience(id: string, patch: Partial<Experience>) {
    update({ experiences: profile.experiences.map((exp) => (exp.id === id ? { ...exp, ...patch } : exp)) })
  }

  return (
    <section className="section" aria-labelledby="profile-heading">
      <h2 id="profile-heading" className="section__title" ref={headingRef} tabIndex={-1}>
        Your profile
      </h2>

      <div className="form-grid">
        <TextField
          id="profile-name"
          label="Name"
          value={profile.name}
          maxLength={120}
          required
          error={errors.name}
          onChange={(name) => update({ name })}
        />
        <TextField
          id="profile-institution"
          label="School"
          value={profile.institution}
          onChange={(institution) => update({ institution })}
        />
        <TextField
          id="profile-degree"
          label="Degree and year"
          value={profile.degreeYear}
          onChange={(degreeYear) => update({ degreeYear })}
        />
        <TextField id="profile-major" label="Major" value={profile.major} onChange={(major) => update({ major })} />
      </div>

      <ChipInput
        id="profile-skills"
        label="Skills"
        values={profile.skills}
        onChange={(skills) => update({ skills })}
        max={15}
        maxLength={60}
        hint="Up to 15. Press Enter to add."
      />

      <fieldset className="fieldset">
        <legend className="field__label">Experience</legend>
        {profile.experiences.length === 0 && <p className="empty-line">No experience added.</p>}
        <ol className="experience-list">
          {profile.experiences.map((exp, index) => {
            const titleError = errors[`exp-${exp.id}-title`]
            const titleId = `exp-${exp.id}-title`
            const descId = `exp-${exp.id}-description`
            return (
              <li key={exp.id} className="experience">
                <div className="experience__header">
                  <span className="experience__index">Experience {index + 1}</span>
                  <button
                    type="button"
                    className="btn-text"
                    aria-label={`Remove experience ${index + 1}${exp.title ? `: ${exp.title}` : ''}`}
                    onClick={() => update({ experiences: profile.experiences.filter((item) => item.id !== exp.id) })}
                  >
                    Remove
                  </button>
                </div>
                <p className="experience__title">{exp.title || 'New experience'}</p>
                <details className="disclosure" open={!exp.title || Boolean(titleError)}>
                <summary>Edit experience</summary>
                <div className="field">
                  <label className="field__label" htmlFor={titleId}>
                    Title
                  </label>
                  <input
                    id={titleId}
                    className={`input${titleError ? ' has-error' : ''}`}
                    value={exp.title}
                    maxLength={120}
                    aria-invalid={titleError ? true : undefined}
                    aria-describedby={titleError ? `${titleId}-error` : undefined}
                    onChange={(event) => updateExperience(exp.id, { title: event.target.value })}
                  />
                  {titleError && (
                    <p id={`${titleId}-error`} className="field-error">
                      {titleError}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label className="field__label" htmlFor={descId}>
                    Description
                  </label>
                  <textarea
                    id={descId}
                    className="textarea textarea--short"
                    value={exp.description}
                    maxLength={500}
                    onChange={(event) => updateExperience(exp.id, { description: event.target.value })}
                  />
                  <CharCount length={exp.description.length} max={500} />
                </div>
                </details>
              </li>
            )
          })}
        </ol>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={profile.experiences.length >= MAX_EXPERIENCES}
          onClick={() => update({ experiences: [...profile.experiences, { id: localId(), title: '', description: '' }] })}
        >
          Add experience
        </button>
      </fieldset>
    </section>
  )
})
