from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

Mode = Literal["live", "demo", "cached"]
Recruitment = Literal["recruiting_stated", "closed_stated", "unknown"]
FitLevel = Literal["strong", "partial", "insufficient_evidence"]
SchoolId = Literal["cmu", "stanford", "uw"]
Arrangement = Literal["any", "onsite", "remote", "hybrid"]
JobStatus = Literal["queued", "searching", "organizing", "complete", "partial", "failed", "cancelled"]
SchoolStatus = Literal["pending", "searching", "complete", "failed"]

ID_PATTERN = r"^[A-Za-z0-9_-]{1,64}$"
MONTH_PATTERN = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Experience(ApiModel):
    id: str = Field(pattern=ID_PATTERN)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class Preferences(ApiModel):
    interests: list[str] = Field(default_factory=list, max_length=5)
    schools: list[SchoolId] = Field(default_factory=lambda: ["cmu"])
    start_month: str | None = None
    end_month: str | None = None
    arrangement: Arrangement = "any"
    additional: str = Field(default="", max_length=500)


class Profile(ApiModel):
    id: str = Field(pattern=ID_PATTERN)
    version: int = Field(ge=0)
    name: str | None = Field(default=None, max_length=120)
    institution: str | None = Field(default=None, max_length=200)
    degree_year: str | None = Field(default=None, max_length=120)
    major: str | None = Field(default=None, max_length=200)
    skills: list[str] = Field(default_factory=list, max_length=15)
    experiences: list[Experience] = Field(default_factory=list, max_length=8)
    preferences: Preferences = Field(default_factory=Preferences)
    confirmed: bool = False


class ConfirmProfileRequest(Profile):
    """A user-edited profile. Stricter validation than an extracted draft."""

    @model_validator(mode="after")
    def _validate_for_search(self) -> "ConfirmProfileRequest":
        self.name = (self.name or "").strip()
        if not self.name:
            raise ValueError("Add your name.")
        prefs = self.preferences
        interests = [term.strip() for term in prefs.interests]
        if not 1 <= len(interests) <= 5:
            raise ValueError("Add between 1 and 5 research interests.")
        if any(not 2 <= len(term) <= 80 for term in interests):
            raise ValueError("Each research interest must be 2–80 characters.")
        prefs.interests = interests
        if not prefs.schools:
            raise ValueError("Choose at least one university.")
        if len(set(prefs.schools)) != len(prefs.schools):
            raise ValueError("Each university can only be selected once.")
        for month in (prefs.start_month, prefs.end_month):
            if month is not None and not MONTH_PATTERN.match(month):
                raise ValueError("Months must use the YYYY-MM format.")
        if prefs.start_month and prefs.end_month and prefs.end_month < prefs.start_month:
            raise ValueError("The end month can't be earlier than the start month.")
        ids = [exp.id for exp in self.experiences]
        if len(set(ids)) != len(ids):
            raise ValueError("Each experience needs a unique ID.")
        self.skills = [skill.strip() for skill in self.skills if skill.strip()]
        return self


class Source(ApiModel):
    id: str
    title: str
    url: str | None
    domain: str | None
    summary: str
    retrieved_at: str
    published_at: str | None = None
    sample: bool = False


class FitReason(ApiModel):
    text: str
    experience_ids: list[str] = Field(default_factory=list)
    interest_terms: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class Candidate(ApiModel):
    id: str
    school_id: SchoolId
    name: str
    entity_type: Literal["faculty", "lab"]
    lab: str | None = None
    research_summary: str
    fit_level: FitLevel
    fit_reasons: list[FitReason]
    recruitment: Recruitment = "unknown"
    recruitment_explanation: str
    recruitment_source_ids: list[str] = Field(default_factory=list)
    unknowns: list[str] = Field(default_factory=list)
    sources: list[Source]
    mode: Mode = "live"


class SchoolProgress(ApiModel):
    school_id: SchoolId
    name: str
    status: SchoolStatus = "pending"
    error_code: str | None = None
    error_message: str | None = None


class SearchJobOut(ApiModel):
    id: str
    status: JobStatus
    profile_id: str
    profile_version: int
    schools: list[SchoolProgress]
    current_school_id: SchoolId | None = None
    candidates: list[Candidate] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    created_at: str
    retrieved_at: str | None = None
    retry_of: str | None = None
    mode: Mode = "live"


class SearchRequest(ApiModel):
    profile_id: str = Field(pattern=ID_PATTERN)
    profile_version: int = Field(ge=1)


class RetryRequest(ApiModel):
    school_ids: list[SchoolId] = Field(min_length=1, max_length=3)


class JobCreated(ApiModel):
    job_id: str


class DraftRequest(ApiModel):
    profile_id: str = Field(pattern=ID_PATTERN)
    profile_version: int = Field(ge=1)
    job_id: str
    candidate_id: str
    selected_experience_ids: list[str] = Field(default_factory=list, max_length=8)
    education_only: bool = False
    user_request: str = Field(default="", max_length=500)
    signature_name: str = Field(default="", max_length=120)
    availability: str = Field(default="", max_length=160)
    review_confirmed: bool = False

    @field_validator("user_request", "signature_name", "availability")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class EmailDraft(ApiModel):
    id: str
    candidate_id: str
    profile_version: int
    subject: str
    body: str
    created_at: str
    mode: Mode = "live"


class Health(ApiModel):
    status: Literal["ok"]
    live_configured: bool
