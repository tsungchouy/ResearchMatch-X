from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import datetime, timezone

from ..config import SCHOOLS, School, Settings
from ..errors import AppError
from ..schemas import Candidate, Profile, SchoolProgress, SearchJobOut
from ..store import SearchJob, Session
from .matching import OrganizedSchool, allowed_sources, build_candidates, rank_candidates, source_refs
from .openai_client import DATA_GUARD, Gateway

logger = logging.getLogger("researchmatch.search")

SEARCH_INSTRUCTIONS = """You help an undergraduate find research opportunities at one university.
Use the web search tool to find current faculty profile pages, lab pages and undergraduate research pages
on the allowed university domain. Do not rely on memory: only report what the pages you found say.
Report up to 3 faculty members or labs whose research most closely relates to the student's interests.
For each, give: the person's name (or lab name), lab, department, research areas in your own words, and
any explicit statement about recruiting undergraduates — quote the term or date and who it applies to
(undergraduates, PhD applicants, etc.). If no recruiting statement is found, say so. Cite the pages you used.
Never guess email addresses."""

ORGANIZE_INSTRUCTIONS = f"""You organize web search notes about university research into structured candidates.
{DATA_GUARD}
Rules:
- Use only facts present in the search notes. Never add papers, projects, people or positions that are not there.
- Reference sources only by the refs listed in the source list (S1, S2, ...). Never write URLs.
- Return at most 3 candidates. Leave out anyone who has no clear connection to the student's interests or no source.
- fit_level: "strong" when the research clearly matches an interest and a specific experience; "partial" when it
  matches an interest only; "insufficient_evidence" when the connection is unclear.
- fit_reasons: at most 2 short, specific sentences linking the research to the student's interests or experiences.
  experience_ids must be copied exactly from the student's experience list; use [] when no experience applies.
  interest_terms must be copied from the student's interests. Each reason needs at least one source ref.
- recruitment: "recruiting_stated" only if a source explicitly says undergraduates are being recruited for a stated
  term or date; "closed_stated" only if a source explicitly says positions are closed; otherwise "unknown".
  PhD-only recruiting, old announcements, or general "students welcome" text is "unknown".
- recruitment_explanation: one short sentence in plain language about what the sources do or don't say.
- unknowns: up to 2 important things the student still needs to confirm (e.g. eligibility, timing, remote options).
- conflicts: direct conflicts with the student's stated availability or work arrangement, if a source shows one.
- sources: for each ref you used, a short title and a one-sentence paraphrased summary (not a quotation),
  and published_at only if the page shows a date (YYYY, YYYY-MM or YYYY-MM-DD), otherwise null."""


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def job_out(job: SearchJob) -> SearchJobOut:
    return SearchJobOut(
        id=job.id,
        status=job.status,  # type: ignore[arg-type]
        profile_id=job.profile_id,
        profile_version=job.profile_version,
        schools=[progress.model_copy() for progress in job.schools],
        current_school_id=job.current_school_id,  # type: ignore[arg-type]
        candidates=list(job.candidates),
        warnings=list(job.warnings),
        created_at=job.created_at,
        retrieved_at=job.retrieved_at,
        retry_of=job.retry_of,
        mode="live",
    )


def create_job(session: Session, profile: Profile, retry_from: SearchJob | None = None,
               retry_school_ids: list[str] | None = None) -> SearchJob:
    job = SearchJob(
        id=f"job-{uuid.uuid4().hex}",
        session_id=session.id,
        profile_id=profile.id,
        profile_version=profile.version,
        schools=[],
        created_at=now_iso(),
        retry_of=retry_from.id if retry_from else None,
    )
    if retry_from is None:
        job.schools = [SchoolProgress(school_id=sid, name=SCHOOLS[sid].name) for sid in profile.preferences.schools]
    else:
        retry_set = set(retry_school_ids or [])
        for old in retry_from.schools:
            progress = old.model_copy()
            if old.school_id in retry_set:
                progress.status = "pending"
                progress.error_code = None
                progress.error_message = None
            elif old.status == "complete":
                job.candidates_by_school[old.school_id] = list(retry_from.candidates_by_school.get(old.school_id, []))
            job.schools.append(progress)
        job.warnings = [w for w in retry_from.warnings if not any(SCHOOLS[s].name in w for s in retry_set)]
    session.jobs[job.id] = job
    return job


def start_job(job: SearchJob, profile: Profile, gateway: Gateway, settings: Settings) -> None:
    job.task = asyncio.create_task(run_job(job, profile, gateway, settings))


def search_input(profile: Profile, school: School) -> str:
    stage = ", ".join(part for part in (profile.degree_year, profile.major) if part) or "undergraduate student"
    skills = ", ".join(profile.skills[:10]) or "not specified"
    interests = "; ".join(profile.preferences.interests)
    return (
        f"University: {school.name} (domain {school.domain})\n"
        f"Student stage: {stage}\n"
        f"Research interests: {interests}\n"
        f"Relevant skills: {skills}\n"
        "Find faculty or labs at this university whose research matches these interests, and any current "
        "undergraduate research opportunities they describe."
    )


def organize_input(profile: Profile, school: School, notes: str, refs: dict) -> str:
    source_lines = "\n".join(f"{ref}: {src.title or '(untitled)'} — {src.url}" for ref, src in refs.items())
    experiences = "\n".join(
        f"- id={exp.id} | {exp.title} | {exp.description[:300]}" for exp in profile.experiences
    ) or "(none)"
    prefs = profile.preferences
    availability = f"{prefs.start_month or 'not sure'} to {prefs.end_month or 'not sure'}"
    return (
        f"University: {school.name}\n"
        f"Student interests: {'; '.join(prefs.interests)}\n"
        f"Student skills: {', '.join(profile.skills) or '(none)'}\n"
        f"Student availability: {availability}; work arrangement preference: {prefs.arrangement}\n"
        f"Student experiences:\n{experiences}\n\n"
        f"Source list:\n{source_lines}\n\n"
        f"<data>\n{notes[:24000]}\n</data>"
    )


async def run_job(job: SearchJob, profile: Profile, gateway: Gateway, settings: Settings) -> None:
    try:
        for progress in job.schools:
            if job.cancelled:
                return
            if progress.status != "pending":
                continue
            school = SCHOOLS[progress.school_id]
            progress.status = "searching"
            job.status = "searching"
            job.current_school_id = school.id
            try:
                candidates, warnings = await _search_school(job, profile, school, gateway, settings)
            except AppError as exc:
                if job.cancelled:
                    return
                progress.status = "failed"
                progress.error_code = exc.code
                progress.error_message = exc.message
                continue
            except Exception:  # pragma: no cover - unexpected provider/SDK failures
                logger.exception("Search for %s failed unexpectedly", school.id)
                if job.cancelled:
                    return
                progress.status = "failed"
                progress.error_code = "SEARCH_FAILED"
                progress.error_message = "This university couldn't be searched."
                continue
            if job.cancelled:
                return
            job.candidates_by_school[school.id] = candidates
            job.warnings.extend(warnings)
            progress.status = "complete"
        if job.cancelled:
            return
        job.current_school_id = None
        job.status = "organizing"
        merged: list[Candidate] = []
        for progress in job.schools:
            merged.extend(job.candidates_by_school.get(progress.school_id, []))
        job.candidates = rank_candidates(merged, settings.max_candidates_total)
        job.retrieved_at = now_iso()
        statuses = [progress.status for progress in job.schools]
        if all(status == "failed" for status in statuses):
            job.status = "failed"
        elif any(status == "failed" for status in statuses):
            job.status = "partial"
        else:
            job.status = "complete"
    finally:
        job.current_school_id = None
        if not job.terminal:
            job.status = "cancelled" if job.cancelled else "failed"


async def _search_school(
    job: SearchJob, profile: Profile, school: School, gateway: Gateway, settings: Settings
) -> tuple[list[Candidate], list[str]]:
    result = await gateway.web_search(
        instructions=SEARCH_INSTRUCTIONS, input=search_input(profile, school), domain=school.domain
    )
    job.provider_log.append(
        {"school": school.id, "responseId": result.response_id, "usage": result.usage, "elapsed": result.elapsed_s}
    )
    if job.cancelled:
        return [], []
    if result.search_call_count == 0:
        raise AppError("NO_SEARCH_PERFORMED", "The search didn't run for this university.", status=502, retryable=True)
    usable = allowed_sources(result.sources, school.domain)
    if not usable:
        return [], []
    refs = source_refs(usable)
    job.status = "organizing"
    organized = await gateway.structured(
        instructions=ORGANIZE_INSTRUCTIONS,
        input=organize_input(profile, school, result.text, refs),
        model=OrganizedSchool,
        name="school_candidates",
    )
    return build_candidates(
        organized, school, refs, profile, retrieved_at=now_iso(), limit=settings.max_candidates_per_school
    )
