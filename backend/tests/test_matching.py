from app.config import SCHOOLS
from app.schemas import Experience, Profile
from app.services.matching import (
    OrganizedSchool,
    allowed_sources,
    build_candidates,
    candidate_id,
    is_allowed_url,
    rank_candidates,
    source_refs,
)
from app.services.openai_client import RetrievedSource

from .conftest import organized_for


def test_domain_allow_rule():
    assert is_allowed_url("https://cmu.edu/page", "cmu.edu")
    assert is_allowed_url("https://www.cs.cmu.edu/~someone", "cmu.edu")
    assert is_allowed_url("http://hcii.cmu.edu", "cmu.edu")
    assert not is_allowed_url("https://cmu.edu.example.com/page", "cmu.edu")
    assert not is_allowed_url("https://notcmu.edu/page", "cmu.edu")
    assert not is_allowed_url("https://cmu.edu@evil.com/page", "cmu.edu")
    assert not is_allowed_url("ftp://cmu.edu/file", "cmu.edu")
    assert not is_allowed_url("javascript:alert(1)", "cmu.edu")
    assert not is_allowed_url("", "cmu.edu")
    assert not is_allowed_url(None, "cmu.edu")


def _profile() -> Profile:
    return Profile(
        id="prof-1",
        version=1,
        experiences=[Experience(id="exp-a", title="Accessible notes", description="App")],
        confirmed=True,
    )


def _build():
    school = SCHOOLS["cmu"]
    retrieved = [
        RetrievedSource("https://www.cmu.edu/people/rivera", "Rivera"),
        RetrievedSource("https://lab.cmu.edu/join", "Join"),
        RetrievedSource("https://cmu.edu/okafor", None),
        RetrievedSource("https://cmu.edu.example.com/fake", "Spoof"),
    ]
    usable = allowed_sources(retrieved, school.domain)
    assert [s.url for s in usable] == [r.url for r in retrieved[:3]]
    refs = source_refs(usable)
    organized = OrganizedSchool.model_validate(organized_for(["exp-a"]))
    return build_candidates(organized, school, refs, _profile(), "2026-10-17T00:00:00Z", limit=3)


def test_sources_must_exist_and_unsourced_candidates_are_dropped():
    candidates, warnings = _build()
    names = [c.name for c in candidates]
    assert "Unsourced Person" not in names
    assert warnings and "lacked sources" in warnings[0]
    rivera = candidates[0]
    source_ids = {s.id for s in rivera.sources}
    for reason in rivera.fit_reasons:
        assert reason.source_ids and set(reason.source_ids) <= source_ids
        assert "exp-invented" not in reason.experience_ids
    assert all(s.url and s.url.startswith("https://") for s in rivera.sources)


def test_recruitment_rules():
    candidates, _ = _build()
    rivera, okafor = candidates
    # Explicit undergraduate recruiting with a term and a source stays.
    assert rivera.recruitment == "recruiting_stated"
    assert rivera.recruitment_source_ids
    # PhD-only recruiting is downgraded to unknown.
    assert okafor.recruitment == "unknown"
    assert okafor.recruitment_source_ids == []
    assert any("undergraduate" in u.lower() for u in okafor.unknowns)
    # Invalid page date is dropped rather than shown.
    assert okafor.sources[0].published_at is None
    assert okafor.sources[0].title == "cmu.edu"


def test_recruitment_without_source_becomes_unknown():
    data = organized_for(["exp-a"])
    data["candidates"][0]["recruitment_source_refs"] = ["S77"]
    school = SCHOOLS["cmu"]
    refs = source_refs([RetrievedSource("https://www.cmu.edu/people/rivera"), RetrievedSource("https://lab.cmu.edu/j")])
    candidates, _ = build_candidates(
        OrganizedSchool.model_validate(data), school, refs, _profile(), "2026-10-17T00:00:00Z", 3
    )
    assert candidates[0].recruitment == "unknown"


def test_stable_ids_and_ranking():
    assert candidate_id("cmu", "Prof. Jordan Rivera") == candidate_id("cmu", "jordan  rivera")
    assert candidate_id("cmu", "Jordan Rivera") != candidate_id("uw", "Jordan Rivera")
    candidates, _ = _build()
    ranked = rank_candidates(list(reversed(candidates)) + candidates, limit=5)
    assert [c.fit_level for c in ranked] == ["strong", "partial"]
