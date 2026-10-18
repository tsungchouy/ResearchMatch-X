from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


@dataclass(frozen=True)
class School:
    id: str
    name: str
    domain: str


SCHOOLS: dict[str, School] = {
    "cmu": School("cmu", "Carnegie Mellon University", "cmu.edu"),
    "stanford": School("stanford", "Stanford University", "stanford.edu"),
    "uw": School("uw", "University of Washington", "washington.edu"),
}


@dataclass(frozen=True)
class Settings:
    openai_api_key: str = ""
    openai_model: str = ""
    openai_reasoning_effort: str | None = None
    openai_base_url: str | None = None
    request_timeout_s: float = 180.0
    session_ttl_s: float = 30 * 60
    cors_origins: list[str] = field(default_factory=list)
    max_candidates_per_school: int = 3
    max_candidates_total: int = 5

    @property
    def live_configured(self) -> bool:
        return bool(self.openai_api_key and self.openai_model)


def _split(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        openai_model=os.getenv("OPENAI_MODEL", "").strip(),
        openai_reasoning_effort=os.getenv("OPENAI_REASONING_EFFORT", "").strip() or None,
        openai_base_url=os.getenv("OPENAI_BASE_URL", "").strip() or None,
        request_timeout_s=float(os.getenv("OPENAI_TIMEOUT_SECONDS", "180")),
        cors_origins=_split(os.getenv("CORS_ORIGINS", "")),
    )
