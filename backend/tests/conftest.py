from __future__ import annotations

import asyncio
import io
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.deps import get_gateway
from app.errors import AppError
from app.main import create_app
from app.services.draft import DraftOut
from app.services.matching import OrganizedSchool
from app.services.openai_client import RetrievedSource, WebSearchResult
from app.services.profile import ExtractedProfile

RESUME_TEXT = (
    "Alex Chen, Example University. BS Computer Science, junior. Skills: Python, React, user studies. "
    "Research assistant in a human-computer interaction lab running interview studies with 12 participants. "
    "Built an accessible note-taking prototype for screen-reader users."
)


def organized_for(experience_ids: list[str]) -> dict[str, Any]:
    exp = experience_ids[:1]
    return {
        "candidates": [
            {
                "name": "Prof. Jordan Rivera",
                "entity_type": "faculty",
                "lab": "Accessible Computing Lab",
                "research_summary": "Studies accessible interfaces for blind and low-vision people.",
                "fit_level": "strong",
                "fit_reasons": [
                    {
                        "text": "Accessibility research connects to the screen-reader prototype.",
                        "experience_ids": exp + ["exp-invented"],
                        "interest_terms": ["HCI"],
                        "source_refs": ["S1", "S99"],
                    }
                ],
                "recruitment": "recruiting_stated",
                "recruitment_applies_to_undergraduates": True,
                "recruitment_term_or_date": "Summer 2027",
                "recruitment_explanation": "The lab page invites undergraduates to apply for Summer 2027.",
                "recruitment_source_refs": ["S2"],
                "unknowns": ["Whether remote work is possible"],
                "conflicts": [],
                "sources": [
                    {"ref": "S1", "title": "Faculty profile", "summary": "Profile page.", "published_at": None},
                    {"ref": "S2", "title": "Join the lab", "summary": "Openings.", "published_at": "2026-09"},
                ],
            },
            {
                "name": "Dr. Sam Okafor",
                "entity_type": "faculty",
                "lab": None,
                "research_summary": "Machine learning for health.",
                "fit_level": "partial",
                "fit_reasons": [
                    {
                        "text": "Mentions HCI methods.",
                        "experience_ids": [],
                        "interest_terms": ["HCI"],
                        "source_refs": ["S3"],
                    }
                ],
                "recruitment": "recruiting_stated",
                "recruitment_applies_to_undergraduates": False,
                "recruitment_term_or_date": "Fall 2026",
                "recruitment_explanation": "Recruiting PhD students.",
                "recruitment_source_refs": ["S3"],
                "unknowns": [],
                "conflicts": [],
                "sources": [{"ref": "S3", "title": "", "summary": "Bio.", "published_at": "sometime"}],
            },
            {
                "name": "Unsourced Person",
                "entity_type": "faculty",
                "lab": None,
                "research_summary": "No source.",
                "fit_level": "strong",
                "fit_reasons": [
                    {"text": "Guess.", "experience_ids": exp, "interest_terms": ["HCI"], "source_refs": ["S42"]}
                ],
                "recruitment": "unknown",
                "recruitment_applies_to_undergraduates": False,
                "recruitment_term_or_date": None,
                "recruitment_explanation": "",
                "recruitment_source_refs": [],
                "unknowns": [],
                "conflicts": [],
                "sources": [],
            },
        ]
    }


@dataclass
class FakeGateway:
    fail_domains: set[str] = field(default_factory=set)
    no_search_domains: set[str] = field(default_factory=set)
    delay_s: float = 0.0
    calls: list[str] = field(default_factory=list)
    search_inputs: list[str] = field(default_factory=list)
    experience_ids: list[str] = field(default_factory=list)

    async def structured(self, *, instructions: str, input: str, model, name: str):
        self.calls.append(name)
        if model is ExtractedProfile:
            return ExtractedProfile(
                name="Alex Chen",
                institution="Example University",
                degree_year="BS, junior",
                major="Computer Science",
                skills=["Python", "React", "python", "User studies"],
                experiences=[
                    {"title": "Research assistant, HCI lab", "description": "Interview studies."},
                    {"title": "Accessible notes prototype", "description": "Screen-reader friendly app."},
                ],
            )
        if model is OrganizedSchool:
            ids = [line.split("id=")[1].split(" ")[0] for line in input.splitlines() if "id=" in line]
            return OrganizedSchool.model_validate(organized_for(ids))
        if model is DraftOut:
            return DraftOut(subject="Undergraduate research inquiry", body="Dear Professor Rivera,\n\nHello. Contact me at a@b.com.")
        raise AssertionError(f"unexpected model {model}")

    async def web_search(self, *, instructions: str, input: str, domain: str) -> WebSearchResult:
        self.calls.append(f"search:{domain}")
        self.search_inputs.append(input)
        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        if domain in self.fail_domains:
            raise AppError("SEARCH_TIMEOUT", "Search took too long. Try again.", status=504, retryable=True)
        if domain in self.no_search_domains:
            return WebSearchResult(text="From memory.", sources=[], search_call_count=0)
        return WebSearchResult(
            text=f"Notes for {domain}",
            sources=[
                RetrievedSource(f"https://www.{domain}/people/rivera", "Rivera profile"),
                RetrievedSource(f"https://lab.{domain}/join", "Join"),
                RetrievedSource(f"https://{domain}/okafor", None),
                RetrievedSource(f"https://{domain}.example.com/fake", "Spoof"),
            ],
            search_call_count=2,
            response_id="resp_test",
        )


@pytest.fixture
def gateway() -> FakeGateway:
    return FakeGateway()


@pytest.fixture
def live_settings() -> Settings:
    return Settings(openai_api_key="test-key", openai_model="test-model")


@pytest.fixture
def client(gateway: FakeGateway, live_settings: Settings):
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: live_settings
    app.dependency_overrides[get_gateway] = lambda: gateway
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


def new_session() -> dict[str, str]:
    return {"X-Session-ID": secrets.token_hex(16)}


def extract_and_confirm(client: TestClient, headers: dict[str, str], schools=("cmu",)) -> dict[str, Any]:
    response = client.post("/api/profile/extract", data={"text": RESUME_TEXT}, headers=headers)
    assert response.status_code == 200, response.text
    profile = response.json()
    profile["preferences"].update(interests=["HCI"], schools=list(schools))
    response = client.post("/api/profile/confirm", json=profile, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def wait_for_job(client: TestClient, headers: dict[str, str], job_id: str, timeout: float = 5.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        job = client.get(f"/api/search/{job_id}", headers=headers).json()
        if job["status"] in {"complete", "partial", "failed", "cancelled"}:
            return job
        time.sleep(0.02)
    raise AssertionError("job did not finish")


def make_pdf(text: str, pages: int = 1) -> bytes:
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)
    for _ in range(pages):
        y = 740
        for chunk in [text[i : i + 90] for i in range(0, len(text), 90)]:
            pdf.drawString(40, y, chunk)
            y -= 16
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()
