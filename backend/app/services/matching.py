"""Server-side validation of model-organized candidates.

The model only ever references sources by the refs we hand it (S1, S2, ...). URLs,
IDs and the final recruitment label are decided here, not by the model.
"""

from __future__ import annotations

import hashlib
import re
import unicodedata
from typing import Callable, Literal
from urllib.parse import urlsplit

from pydantic import BaseModel

from ..config import School
from ..schemas import Candidate, FitReason, Profile, Recruitment, Source
from .openai_client import RetrievedSource

DATE_PATTERN = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
HONORIFICS = re.compile(r"^(prof(essor)?|dr|assistant professor|associate professor)\.?\s+", re.IGNORECASE)
MAX_REASONS = 4
MAX_UNKNOWNS = 4


class OrganizedSource(BaseModel):
    ref: str
    title: str
    summary: str
    published_at: str | None


class OrganizedReason(BaseModel):
    text: str
    experience_ids: list[str]
    interest_terms: list[str]
    source_refs: list[str]


class OrganizedCandidate(BaseModel):
    name: str
    entity_type: Literal["faculty", "lab"]
    lab: str | None
    research_summary: str
    fit_level: Literal["strong", "partial", "insufficient_evidence"]
    fit_reasons: list[OrganizedReason]
    recruitment: Recruitment
    recruitment_applies_to_undergraduates: bool
    recruitment_term_or_date: str | None
    recruitment_explanation: str
    recruitment_source_refs: list[str]
    unknowns: list[str]
    conflicts: list[str]
    sources: list[OrganizedSource]


class OrganizedSchool(BaseModel):
    candidates: list[OrganizedCandidate]


def is_allowed_url(url: str | None, domain: str) -> bool:
    if not url:
        return False
    try:
        parsed = urlsplit(url.strip())
        host = (parsed.hostname or "").lower().rstrip(".")
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    domain = domain.lower().strip(".")
    return host == domain or host.endswith("." + domain)


def hostname(url: str) -> str:
    return (urlsplit(url).hostname or "").lower()


def normalize_name(name: str) -> str:
    text = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    text = HONORIFICS.sub("", text.strip())
    text = re.sub(r"[^a-z0-9 ]+", " ", text.lower())
    return re.sub(r"\s+", " ", text).strip()


def candidate_id(school_id: str, name: str) -> str:
    digest = hashlib.sha1(f"{school_id}:{normalize_name(name)}".encode()).hexdigest()[:10]
    return f"cand-{school_id}-{digest}"


def source_id(url: str) -> str:
    return "src-" + hashlib.sha1(url.encode()).hexdigest()[:10]


def allowed_sources(retrieved: list[RetrievedSource], domain: str) -> list[RetrievedSource]:
    return [source for source in retrieved if is_allowed_url(source.url, domain)]


def source_refs(sources: list[RetrievedSource]) -> dict[str, RetrievedSource]:
    return {f"S{index}": source for index, source in enumerate(sources, start=1)}


def build_candidates(
    organized: OrganizedSchool,
    school: School,
    refs: dict[str, RetrievedSource],
    profile: Profile,
    retrieved_at: str,
    limit: int,
) -> tuple[list[Candidate], list[str]]:
    """Validate organized output; drop anything that can't be traced to a retrieved source."""
    experience_ids = {exp.id for exp in profile.experiences}
    candidates: list[Candidate] = []
    dropped = 0
    seen: set[str] = set()

    for item in organized.candidates:
        name = item.name.strip()
        if not name:
            dropped += 1
            continue
        cid = candidate_id(school.id, name)
        if cid in seen:
            continue

        described = {src.ref: src for src in item.sources}
        sources_by_ref: dict[str, Source] = {}

        def resolve(ref: str) -> str | None:
            retrieved = refs.get(ref)
            if retrieved is None or not is_allowed_url(retrieved.url, school.domain):
                return None
            if ref not in sources_by_ref:
                info = described.get(ref)
                published = info.published_at if info else None
                title = (info.title if info else "") or retrieved.title or hostname(retrieved.url)
                sources_by_ref[ref] = Source(
                    id=source_id(retrieved.url),
                    title=title.strip()[:160],
                    url=retrieved.url,
                    domain=hostname(retrieved.url),
                    summary=(info.summary if info else "").strip()[:600],
                    retrieved_at=retrieved_at,
                    published_at=published if published and DATE_PATTERN.match(published) else None,
                    sample=False,
                )
            return sources_by_ref[ref].id

        reasons: list[FitReason] = []
        for reason in item.fit_reasons:
            sids = [sid for sid in (resolve(ref) for ref in reason.source_refs) if sid]
            exp_ids = [eid for eid in reason.experience_ids if eid in experience_ids]
            terms = [term.strip() for term in reason.interest_terms if term.strip()]
            if not reason.text.strip() or not sids or not (exp_ids or terms):
                continue
            reasons.append(
                FitReason(
                    text=reason.text.strip()[:400],
                    experience_ids=list(dict.fromkeys(exp_ids)),
                    interest_terms=list(dict.fromkeys(terms))[:5],
                    source_ids=list(dict.fromkeys(sids)),
                )
            )
        if not reasons or item.fit_level == "insufficient_evidence":
            dropped += 1
            continue

        recruitment, explanation, recruitment_sids = decide_recruitment(item, resolve)

        unknowns = [f"Possible conflict: {text.strip()}" for text in item.conflicts if text.strip()]
        unknowns += [text.strip() for text in item.unknowns if text.strip()]
        if recruitment == "unknown" and not any("undergrad" in u.lower() for u in unknowns):
            unknowns.append("Whether undergraduate research positions are currently open")

        seen.add(cid)
        candidates.append(
            Candidate(
                id=cid,
                school_id=school.id,  # type: ignore[arg-type]
                name=name[:160],
                entity_type=item.entity_type,
                lab=(item.lab or "").strip()[:160] or None,
                research_summary=item.research_summary.strip()[:700],
                fit_level=item.fit_level,
                fit_reasons=reasons[:MAX_REASONS],
                recruitment=recruitment,
                recruitment_explanation=explanation,
                recruitment_source_ids=recruitment_sids,
                unknowns=list(dict.fromkeys(unknowns))[:MAX_UNKNOWNS],
                sources=list(sources_by_ref.values()),
                mode="live",
            )
        )
        if len(candidates) >= limit:
            break

    warnings = []
    if dropped:
        warnings.append(f"{dropped} result(s) from {school.name} were left out because they lacked sources.")
    return candidates, warnings


def decide_recruitment(
    item: OrganizedCandidate, resolve: Callable[[str], str | None]
) -> tuple[Recruitment, str, list[str]]:
    explanation = item.recruitment_explanation.strip()[:400]
    if item.recruitment == "unknown":
        return "unknown", "No source clearly states the current undergraduate recruiting status.", []
    sids = [sid for sid in (resolve(ref) for ref in item.recruitment_source_refs) if sid]
    if not sids:
        return "unknown", "No source was found that states the current recruiting status.", []
    if item.recruitment == "recruiting_stated" and (
        not item.recruitment_applies_to_undergraduates or not (item.recruitment_term_or_date or "").strip()
    ):
        return (
            "unknown",
            "A recruiting note was found, but it doesn't clearly apply to undergraduates for a stated term.",
            [],
        )
    return item.recruitment, explanation, sids


def rank_candidates(candidates: list[Candidate], limit: int) -> list[Candidate]:
    """Relevance order: strong fit first, then reasons backed by the student's own experiences."""
    level_rank = {"strong": 0, "partial": 1, "insufficient_evidence": 2}
    deduped: dict[str, Candidate] = {}
    for cand in candidates:
        deduped.setdefault(f"{cand.school_id}:{normalize_name(cand.name)}", cand)

    def key(indexed: tuple[int, Candidate]):
        index, cand = indexed
        experience_backed = sum(1 for reason in cand.fit_reasons if reason.experience_ids)
        return (level_rank[cand.fit_level], -experience_backed, index)

    ordered = sorted(enumerate(deduped.values()), key=key)
    return [cand for _, cand in ordered][:limit]
