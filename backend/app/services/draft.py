from __future__ import annotations

import re
import uuid

from pydantic import BaseModel

from ..config import SCHOOLS
from ..schemas import Candidate, DraftRequest, EmailDraft, Profile
from .openai_client import DATA_GUARD, Gateway
from .search import now_iso

EMAIL_PATTERN = re.compile(r"[\w.+-]+@[\w-]+(\.[\w-]+)+")
PLACEHOLDER = "[Your name]"


class DraftOut(BaseModel):
    subject: str
    body: str


DRAFT_INSTRUCTIONS = f"""You write a first-draft outreach email from an undergraduate to a faculty member.
{DATA_GUARD}
Rules:
- English, 120-180 words in the body, plain text, polite and specific. No markdown, no links, no footnotes.
- Structure: brief self-introduction (education), the research connection, the selected experiences if any,
  the student's question, availability, a short thank-you, and the signature.
- Use only the details provided. Never invent experiences, skills, courses or results.
- Never claim to have read a specific paper unless it is named in the research summary provided.
- Do not state that the faculty member is recruiting unless the recruiting status says so; ask instead.
- Do not include any email address or phone number.
- Sign off with exactly the signature name provided. If it is "{PLACEHOLDER}", keep that placeholder literally.
- Address the recipient as "Professor <last name>" for faculty, or "Dear <lab name> team" for a lab."""


def draft_input(profile: Profile, candidate: Candidate, request: DraftRequest) -> str:
    selected = [exp for exp in profile.experiences if exp.id in set(request.selected_experience_ids)]
    experiences = "\n".join(f"- {exp.title}: {exp.description}" for exp in selected) or "(none — education only)"
    school = SCHOOLS[candidate.school_id].name
    education = ", ".join(part for part in (profile.degree_year, profile.major, profile.institution) if part)
    recruitment = {
        "recruiting_stated": "A source states undergraduate recruiting.",
        "closed_stated": "A source states positions are closed.",
        "unknown": "Recruiting status is unknown.",
    }[candidate.recruitment]
    return (
        f"Recipient: {candidate.name} ({candidate.entity_type}), {candidate.lab or ''} at {school}\n"
        f"Research summary: <data>{candidate.research_summary}</data>\n"
        f"Recruiting status: {recruitment}\n"
        f"Student education: {education or 'not provided'}\n"
        f"Student interests: {'; '.join(profile.preferences.interests)}\n"
        f"Selected experiences:\n<data>\n{experiences}\n</data>\n"
        f"Student's question: <data>{request.user_request or 'Ask whether there may be a way to get involved.'}</data>\n"
        f"Availability: {request.availability or 'not specified'}\n"
        f"Signature name: {request.signature_name or PLACEHOLDER}"
    )


async def generate_draft(gateway: Gateway, profile: Profile, candidate: Candidate, request: DraftRequest) -> EmailDraft:
    out = await gateway.structured(
        instructions=DRAFT_INSTRUCTIONS,
        input=draft_input(profile, candidate, request),
        model=DraftOut,
        name="outreach_email",
    )
    subject = EMAIL_PATTERN.sub("[email]", out.subject.strip())[:200]
    body = EMAIL_PATTERN.sub("[email]", out.body.strip())
    if not request.signature_name and PLACEHOLDER not in body:
        body = f"{body}\n\n{PLACEHOLDER}"
    return EmailDraft(
        id=f"draft-{uuid.uuid4().hex[:12]}",
        candidate_id=candidate.id,
        profile_version=profile.version,
        subject=subject,
        body=body,
        created_at=now_iso(),
        mode="live",
    )
