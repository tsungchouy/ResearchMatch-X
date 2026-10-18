import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { usePageHeading } from '../app/usePageHeading'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { FileDropzone } from '../components/FileDropzone'
import { InlineAlert } from '../components/InlineAlert'
import { ProfileEditor } from '../components/ProfileEditor'
import { PreferencesForm } from '../components/PreferencesForm'
import { PRESETS, type PresetId } from '../fixtures/demo'
import { cleanProfile, validateProfile, type FieldErrors } from '../lib/validation'
import { createRequestKey, toErrorBody } from '../services/client'
import { useApp } from '../state/context'
import { hasDownstreamWork, type AppMode } from '../state/reducer'
import type { ApiErrorBody } from '../types/api'

const MIN_TEXT = 100
const MAX_TEXT = 20_000

type PendingSwitch = { mode: AppMode; preset?: PresetId } | null

export function ProfilePage() {
  const { state, dispatch, service, resetSession } = useApp()
  const navigate = useNavigate()
  const headingRef = usePageHeading('Profile')
  const profileHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusProfileHeading = useRef(false)
  const [localFileError, setLocalFileError] = useState<string | null>(null)
  const [textError, setTextError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<ApiErrorBody | null>(null)
  const [confirmInvalidate, setConfirmInvalidate] = useState(false)
  const [pendingSwitch, setPendingSwitch] = useState<PendingSwitch>(null)
  const [showPresets, setShowPresets] = useState(false)

  const isDemo = state.mode === 'demo'
  const liveUnavailable = !isDemo && state.health.checked && !state.health.liveConfigured
  const extracting = state.extraction.status === 'loading'
  const serverError = state.extraction.error
  const hasInput = Boolean(state.profileDraft || state.resume.file || state.resume.text.trim())

  useEffect(() => {
    if (state.profileDraft && focusProfileHeading.current) {
      focusProfileHeading.current = false
      profileHeadingRef.current?.focus()
    }
  }, [state.profileDraft])

  function requestSwitch(mode: AppMode, preset?: PresetId) {
    if (hasInput) setPendingSwitch({ mode, preset })
    else applySwitch({ mode, preset })
  }

  function applySwitch(target: NonNullable<PendingSwitch>) {
    setPendingSwitch(null)
    setShowPresets(false)
    setErrors({})
    setSubmitError(null)
    setLocalFileError(null)
    setTextError(null)
    resetSession(target.mode, target.preset)
  }

  async function extract() {
    if (state.resume.tab === 'pdf') {
      if (!state.resume.file) {
        setLocalFileError('Choose a PDF first, or paste text instead.')
        return
      }
    } else {
      const length = state.resume.text.trim().length
      if (length < MIN_TEXT || length > MAX_TEXT) {
        setTextError(
          length < MIN_TEXT
            ? `Add a bit more detail — at least ${MIN_TEXT} characters.`
            : `Keep it under ${MAX_TEXT.toLocaleString()} characters.`,
        )
        document.getElementById('resume-text')?.focus()
        return
      }
    }
    setTextError(null)
    const token = createRequestKey()
    dispatch({ type: 'EXTRACT_START', token })
    try {
      const input =
        state.resume.tab === 'pdf' && state.resume.file
          ? ({ kind: 'pdf', file: state.resume.file } as const)
          : ({ kind: 'text', text: state.resume.text.trim() } as const)
      const profile = await service.extractProfile(input)
      focusProfileHeading.current = true
      dispatch({ type: 'EXTRACT_SUCCESS', token, profile })
    } catch (error) {
      dispatch({ type: 'EXTRACT_FAILURE', token, error: toErrorBody(error) })
    }
  }

  function submit() {
    if (!state.profileDraft) return
    const { errors: found, order } = validateProfile(state.profileDraft)
    setErrors(found)
    if (order.length) {
      document.getElementById(order[0])?.focus()
      return
    }
    const willInvalidate = state.profileDirty && Boolean(state.confirmedProfile) && hasDownstreamWork(state)
    const replacesEditedDraft = state.draft.edited
    if (willInvalidate || replacesEditedDraft || (state.search && !state.profileDirty && state.draft.email)) {
      setConfirmInvalidate(true)
      return
    }
    void runSearch()
  }

  async function runSearch() {
    setConfirmInvalidate(false)
    if (!state.profileDraft) return
    const mode = state.mode
    setSubmitting(true)
    setSubmitError(null)
    try {
      let profile = state.confirmedProfile
      if (!profile || state.profileDirty) {
        profile = await service.confirmProfile(cleanProfile(state.profileDraft))
        dispatch({ type: 'PROFILE_CONFIRMED', profile, mode })
      }
      const { jobId } = await service.startSearch(profile, createRequestKey())
      dispatch({ type: 'SEARCH_STARTED', jobId, profileId: profile.id, profileVersion: profile.version, mode })
      navigate('/matches')
    } catch (error) {
      setSubmitError(toErrorBody(error))
    } finally {
      setSubmitting(false)
    }
  }

  const findDisabledReason = !state.profileDraft
    ? 'Review your background first.'
    : liveUnavailable
      ? 'Live search is not configured.'
      : !state.reviewChecked
        ? 'Check the box above to confirm your details.'
        : null

  const fileError = localFileError ?? (state.resume.tab === 'pdf' ? serverError?.message ?? null : null)
  const textServerError = state.resume.tab === 'text' ? serverError?.message ?? null : null
  const presetLabel = PRESETS.find((preset) => preset.id === state.demoPreset)?.label ?? 'sample'

  const presetChooser = (
    <div className="preset-chooser" role="group" aria-label="Choose a sample profile">
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className={`preset${state.demoPreset === preset.id ? ' is-selected' : ''}`}
          aria-pressed={state.demoPreset === preset.id}
          onClick={() => (state.demoPreset === preset.id ? undefined : requestSwitch('demo', preset.id))}
        >
          <span className="preset__label">{preset.label}</span>
          <span className="preset__description">{preset.description}</span>
        </button>
      ))}
    </div>
  )

  return (
    <div className="page">
      <header className="page-header">
        <h1 ref={headingRef} tabIndex={-1} className="page-title">
          Find research that fits your interests.
        </h1>
        <p className="page-subtitle">Start with your background. Review the evidence before reaching out.</p>
      </header>

      <div className="profile-layout">
        <div className="profile-main">
          {liveUnavailable && (
            <InlineAlert
              tone="info"
              title={state.health.reachable ? 'Live search is not configured. Try the sample workflow.' : 'Live search is unavailable right now. Try the sample workflow.'}
              actions={
                !showPresets && (
                  <button type="button" className="btn btn-secondary" onClick={() => setShowPresets(true)}>
                    Try a sample profile
                  </button>
                )
              }
            >
              {showPresets && presetChooser}
            </InlineAlert>
          )}

          <section className="section" aria-labelledby="background-heading">
            <h2 id="background-heading" className="section__title">
              Your background
            </h2>

            {isDemo ? (
              <InlineAlert
                tone="warning"
                title={`Sample workflow · ${presetLabel}`}
                actions={
                  <button type="button" className="btn-text" onClick={() => requestSwitch('live')}>
                    Leave sample workflow
                  </button>
                }
              >
                <p>
                  This profile comes from a sample. You can edit it, but matches and the email draft stay sample data — no resume is
                  analyzed and no live search runs.
                </p>
                {presetChooser}
              </InlineAlert>
            ) : (
              <ResumeInput
                disabled={extracting || liveUnavailable}
                fileError={fileError}
                textError={textError ?? textServerError}
                onLocalFileError={setLocalFileError}
                onClearTextError={() => setTextError(null)}
              />
            )}

            {!isDemo && (
              <div className="action-row">
                <button
                  type="button"
                  className={`btn ${state.profileDraft ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={extract}
                  disabled={extracting || liveUnavailable}
                  aria-describedby={liveUnavailable ? 'extract-hint' : undefined}
                >
                  {extracting ? 'Reading your background…' : state.profileDraft ? 'Read again' : 'Review extracted profile'}
                </button>
                {liveUnavailable && (
                  <p id="extract-hint" className="field__hint">
                    Reading a resume needs live search.
                  </p>
                )}
                {!liveUnavailable && !showPresets && (
                  <button type="button" className="btn-text" onClick={() => setShowPresets(true)}>
                    Or try a sample profile
                  </button>
                )}
              </div>
            )}
            {!isDemo && !liveUnavailable && showPresets && presetChooser}
            <div aria-live="polite" className="visually-hidden">
              {extracting ? 'Reading your background…' : ''}
            </div>
          </section>

          {state.profileDraft && (
            <>
              <ProfileEditor
                ref={profileHeadingRef}
                profile={state.profileDraft}
                errors={errors}
                onChange={(profile) => dispatch({ type: 'EDIT_PROFILE', profile })}
              />
              <PreferencesForm
                preferences={state.profileDraft.preferences}
                errors={errors}
                onChange={(preferences) =>
                  state.profileDraft && dispatch({ type: 'EDIT_PROFILE', profile: { ...state.profileDraft, preferences } })
                }
              />
              <section className="section section--ruled confirm-section" aria-label="Confirm and search">
                {state.confirmedProfile && state.profileDirty && (
                  <InlineAlert
                    tone="info"
                    actions={
                      <button type="button" className="btn-text" onClick={() => dispatch({ type: 'DISCARD_PROFILE_EDITS' })}>
                        Discard changes
                      </button>
                    }
                  >
                    <p>You have unsaved changes. Searching again will use them and clear your current matches and draft.</p>
                  </InlineAlert>
                )}
                <label className="check-row check-row--plain">
                  <input
                    type="checkbox"
                    checked={state.reviewChecked}
                    onChange={(event) => dispatch({ type: 'SET_REVIEW_CHECKED', checked: event.target.checked })}
                  />
                  <span>I have reviewed my background and preferences.</span>
                </label>
                {submitError && (
                  <InlineAlert tone="error" title="The search couldn’t start.">
                    <p>{submitError.message}</p>
                  </InlineAlert>
                )}
                <div className="action-row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={submit}
                    disabled={Boolean(findDisabledReason) || submitting}
                    aria-describedby={findDisabledReason ? 'find-hint' : undefined}
                  >
                    {submitting ? 'Starting search…' : 'Find research matches'}
                  </button>
                  {findDisabledReason && (
                    <p id="find-hint" className="field__hint">
                      {findDisabledReason}
                    </p>
                  )}
                  {state.search && !state.profileDirty && (
                    <Link to="/matches" className="text-link">
                      View current matches
                    </Link>
                  )}
                </div>
              </section>
            </>
          )}
        </div>

        <aside className="how-it-works" aria-labelledby="how-heading">
          <h2 id="how-heading" className="how-it-works__title">
            How it works
          </h2>
          <ol className="how-it-works__steps">
            <li>Share your background and research interests.</li>
            <li>Review faculty matches and their sources.</li>
            <li>Choose what to include in an outreach draft.</li>
          </ol>
          <p className="how-it-works__note">A research match does not confirm an open position.</p>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmInvalidate}
        title="Replace your current results?"
        confirmLabel="Search again"
        cancelLabel="Keep current results"
        onConfirm={() => void runSearch()}
        onCancel={() => setConfirmInvalidate(false)}
      >
        <p>
          A new search clears your current matches{state.draft.email ? ' and your email draft' : ''}. Download the draft first if you want
          to keep it.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(pendingSwitch)}
        title={pendingSwitch?.mode === 'demo' ? 'Switch to a sample profile?' : 'Leave the sample workflow?'}
        confirmLabel={pendingSwitch?.mode === 'demo' ? 'Use sample' : 'Leave sample'}
        cancelLabel="Stay here"
        onConfirm={() => pendingSwitch && applySwitch(pendingSwitch)}
        onCancel={() => setPendingSwitch(null)}
      >
        <p>This resets the session. Your current input, matches and any draft will be cleared.</p>
      </ConfirmDialog>
    </div>
  )
}

interface ResumeInputProps {
  disabled: boolean
  fileError: string | null
  textError: string | null
  onLocalFileError: (message: string | null) => void
  onClearTextError: () => void
}

function ResumeInput({ disabled, fileError, textError, onLocalFileError, onClearTextError }: ResumeInputProps) {
  const { state, dispatch } = useApp()
  const tabs = [
    { id: 'pdf' as const, label: 'Upload PDF' },
    { id: 'text' as const, label: 'Paste text' },
  ]
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function select(tab: 'pdf' | 'text', focus = false) {
    dispatch({ type: 'SET_RESUME_TAB', tab })
    onLocalFileError(null)
    onClearTextError()
    if (focus) tabRefs.current[tab]?.focus()
  }

  const length = state.resume.text.trim().length

  return (
    <div className="resume-input">
      <div
        role="tablist"
        aria-label="How to share your background"
        className="tabs"
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
            event.preventDefault()
            select(state.resume.tab === 'pdf' ? 'text' : 'pdf', true)
          }
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={state.resume.tab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={state.resume.tab === tab.id ? 0 : -1}
            className={`tab${state.resume.tab === tab.id ? ' is-active' : ''}`}
            onClick={() => select(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="panel-pdf" aria-labelledby="tab-pdf" hidden={state.resume.tab !== 'pdf'} className="tabpanel">
        <FileDropzone
          file={state.resume.file}
          error={fileError}
          disabled={disabled}
          onFile={(file) => dispatch({ type: 'SET_RESUME_FILE', file })}
          onLocalError={onLocalFileError}
          onPasteInstead={() => select('text', true)}
        />
      </div>
      <div role="tabpanel" id="panel-text" aria-labelledby="tab-text" hidden={state.resume.tab !== 'text'} className="tabpanel">
        <div className="field">
          <label htmlFor="resume-text" className="visually-hidden">
            Resume or background text
          </label>
          <textarea
            id="resume-text"
            className={`textarea textarea--resume${textError ? ' has-error' : ''}`}
            placeholder="Paste your resume or a short summary of your background."
            value={state.resume.text}
            maxLength={MAX_TEXT + 1000}
            disabled={disabled}
            aria-invalid={textError ? true : undefined}
            aria-describedby={`resume-text-count${textError ? ' resume-text-error' : ''}`}
            onChange={(event) => {
              dispatch({ type: 'SET_RESUME_TEXT', text: event.target.value })
              onClearTextError()
            }}
          />
          <p id="resume-text-count" className="field__count">
            {length.toLocaleString()} / {MAX_TEXT.toLocaleString()} characters · at least {MIN_TEXT}
          </p>
          {textError && (
            <p id="resume-text-error" className="field-error" role="alert">
              {textError}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
