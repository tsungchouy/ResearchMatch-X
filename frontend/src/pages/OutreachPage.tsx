import { useState } from 'react'
import { Link } from 'react-router'
import { usePageHeading } from '../app/usePageHeading'
import { CharCount } from '../components/CharCount'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EmailEditor, type TrackerSaveState } from '../components/EmailEditor'
import { RecruitmentBadge } from '../components/RecruitmentBadge'
import { useToast } from '../components/Toast'
import { createRequestKey, toErrorBody } from '../services/client'
import { useApp } from '../state/context'
import { findRecord, STATUS_LABEL } from '../state/tracker'
import { useTracker } from '../state/trackerContext'
import { schoolName, type Candidate, type DraftRequest } from '../types/api'

export function OutreachPage({ candidate }: { candidate: Candidate }) {
  const { state, dispatch, service } = useApp()
  const tracker = useTracker()
  const toast = useToast()
  const headingRef = usePageHeading('Prepare your outreach')
  const [confirmReplace, setConfirmReplace] = useState(false)
  const profile = state.confirmedProfile!
  const selection = state.selection!
  const { outreach, draft } = state

  const saved = findRecord(tracker.records, candidate.id, candidate.mode)
  const trackerState: TrackerSaveState = !saved
    ? 'unsaved'
    : saved.subject === draft.subject && saved.body === draft.body
      ? 'saved'
      : 'changed'

  function saveToTracker() {
    const result = tracker.saveDraft(candidate, { subject: draft.subject, body: draft.body })
    toast(result === 'created' ? 'Saved to your tracker' : 'Tracker copy updated')
  }

  const hasSelection = outreach.educationOnly || outreach.selectedExperienceIds.length > 0
  const generateHint = !hasSelection
    ? 'Choose experiences to include, or use your education and interests only.'
    : !outreach.onlySelectedConfirmed
      ? 'Check “Use only the details I selected above.” to continue.'
      : null

  async function generate() {
    setConfirmReplace(false)
    const key = createRequestKey()
    const request: DraftRequest = {
      profileId: profile.id,
      profileVersion: profile.version,
      jobId: selection.jobId,
      candidateId: candidate.id,
      selectedExperienceIds: outreach.educationOnly ? [] : outreach.selectedExperienceIds,
      educationOnly: outreach.educationOnly,
      userRequest: outreach.userRequest.trim(),
      signatureName: outreach.signatureName.trim(),
      availability: outreach.availability.trim(),
      reviewConfirmed: selection.reviewConfirmed,
    }
    dispatch({ type: 'DRAFT_START', key })
    try {
      const email = await service.generateDraft(request, key, candidate, profile)
      dispatch({ type: 'DRAFT_SUCCESS', key, draft: email })
    } catch (error) {
      dispatch({ type: 'DRAFT_FAILURE', key, error: toErrorBody(error) })
    }
  }

  function toggleExperience(id: string, checked: boolean) {
    const next = checked
      ? [...outreach.selectedExperienceIds, id]
      : outreach.selectedExperienceIds.filter((existing) => existing !== id)
    dispatch({ type: 'SET_OUTREACH', patch: { selectedExperienceIds: next, educationOnly: false } })
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1 ref={headingRef} tabIndex={-1} className="page-title">
          Prepare your outreach
        </h1>
        <p className="page-subtitle">Choose what to share, then make the draft your own.</p>
      </header>

      <div className="outreach-layout">
        <aside className="context" aria-labelledby="context-heading">
          <h2 id="context-heading" className="visually-hidden">
            Context
          </h2>
          <div className="context__candidate">
            <p className="match__meta">
              {schoolName(candidate.schoolId)}
              {candidate.lab && candidate.lab !== candidate.name ? ` · ${candidate.lab}` : ''}
            </p>
            <p className="context__name">
              {candidate.name}
              {candidate.mode === 'demo' && <span className="tag tag--sample">Sample</span>}
            </p>
            <div className="match__recruitment">
              <RecruitmentBadge status={candidate.recruitment} />
              <span className="match__recruitment-text">{candidate.recruitmentExplanation}</span>
            </div>
            <Link to="/matches" className="text-link">
              Back to matches
            </Link>
          </div>

          <fieldset className="fieldset context__section">
            <legend className="field__label">Experiences to include</legend>
            {profile.experiences.length === 0 && <p className="field__hint">Your profile has no experiences listed.</p>}
            <div className="check-rows">
              {profile.experiences.map((exp) => (
                <label key={exp.id} className="check-row">
                  <input
                    type="checkbox"
                    checked={outreach.selectedExperienceIds.includes(exp.id)}
                    onChange={(event) => toggleExperience(exp.id, event.target.checked)}
                  />
                  <span>{exp.title}</span>
                </label>
              ))}
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={outreach.educationOnly}
                  onChange={(event) => dispatch({ type: 'SET_OUTREACH', patch: { educationOnly: event.target.checked } })}
                />
                <span>Use my education and interests only</span>
              </label>
            </div>
          </fieldset>

          <div className="field context__section">
            <label className="field__label" htmlFor="outreach-ask">
              What would you like to ask?
            </label>
            <textarea
              id="outreach-ask"
              className="textarea"
              value={outreach.userRequest}
              maxLength={500}
              placeholder="For example: whether there’s a way to get involved next summer."
              onChange={(event) => dispatch({ type: 'SET_OUTREACH', patch: { userRequest: event.target.value } })}
            />
            <CharCount length={outreach.userRequest.length} max={500} />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="outreach-availability">
              Availability
            </label>
            <input
              id="outreach-availability"
              className="input"
              value={outreach.availability}
              maxLength={160}
              placeholder="For example: from June 2027 to August 2027"
              onChange={(event) => dispatch({ type: 'SET_OUTREACH', patch: { availability: event.target.value } })}
            />
          </div>

          <div className="field">
            <label className="field__label" htmlFor="outreach-signature">
              Signature name
            </label>
            <p id="outreach-signature-hint" className="field__hint">
              Leave blank to keep “[Your name]” in the draft.
            </p>
            <input
              id="outreach-signature"
              className="input"
              value={outreach.signatureName}
              maxLength={120}
              aria-describedby="outreach-signature-hint"
              onChange={(event) => dispatch({ type: 'SET_OUTREACH', patch: { signatureName: event.target.value } })}
            />
          </div>

          <label className="check-row check-row--plain context__section">
            <input
              type="checkbox"
              checked={outreach.onlySelectedConfirmed}
              onChange={(event) => dispatch({ type: 'SET_OUTREACH', patch: { onlySelectedConfirmed: event.target.checked } })}
            />
            <span>Use only the details I selected above.</span>
          </label>
        </aside>

        <EmailEditor
          draft={draft}
          candidateId={candidate.id}
          canGenerate={!generateHint}
          generateHint={generateHint}
          trackerState={trackerState}
          trackerStatus={saved ? STATUS_LABEL[saved.status] : null}
          onGenerate={generate}
          onRegenerate={() => (draft.edited ? setConfirmReplace(true) : void generate())}
          onEdit={(patch) => dispatch({ type: 'EDIT_DRAFT', ...patch })}
          onSaveToTracker={saveToTracker}
        />
      </div>

      <ConfirmDialog
        open={confirmReplace}
        title="Replace your edits?"
        confirmLabel="Replace with new draft"
        cancelLabel="Keep my edits"
        onConfirm={() => void generate()}
        onCancel={() => setConfirmReplace(false)}
      >
        <p>A new draft will replace the text you edited. If it fails, your current draft stays.</p>
      </ConfirmDialog>
    </div>
  )
}
