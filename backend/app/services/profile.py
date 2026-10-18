from __future__ import annotations

import io
import logging
import re
import shutil
import subprocess
import threading
import uuid

import pdfplumber
from pydantic import BaseModel
from pypdf import PdfReader
from pypdf.errors import PdfReadError

from ..errors import AppError
from ..schemas import Experience, Preferences, Profile
from .openai_client import DATA_GUARD, Gateway

logger = logging.getLogger("researchmatch.profile")

MAX_PDF_BYTES = 5 * 1024 * 1024
MAX_PDF_PAGES = 10
MIN_TEXT_CHARS = 100
MAX_TEXT_CHARS = 20_000
MIN_PAGE_TEXT_CHARS = 40
OCR_RENDER_SCALE = 2.5

_ocr_lock = threading.Lock()
_ocr_engine = None


class ExtractedExperience(BaseModel):
    title: str
    description: str


class ExtractedProfile(BaseModel):
    name: str | None
    institution: str | None
    degree_year: str | None
    major: str | None
    skills: list[str]
    experiences: list[ExtractedExperience]


EXTRACT_INSTRUCTIONS = f"""You turn a student's resume text into a short structured profile.
{DATA_GUARD}
Rules:
- Only use information that is explicitly present in the text. If a field is missing, return null (or an empty list).
- Never invent schools, degrees, skills, projects or dates.
- Do not include email addresses, phone numbers, street addresses or links anywhere.
- institution: include only the school name.
- major: preserve all majors and minors explicitly listed in the education section.
- degree_year: preserve the degree and education year/status as written, e.g. "BS, junior", "BS 2027",
  or "BS, Aug. 2023 – Present". Do not infer a graduation year.
- skills: up to 15 short items (languages, tools, methods).
- experiences: create one item per named research, project, work or teaching entry, up to 8 items. Keep the role,
  organization/project name and dates in the title when present. The description is a factual summary of at most
  400 characters using the resume's own metrics and achievements. Do not turn club membership into an experience.
"""


def validate_text_input(text: str) -> str:
    cleaned = text.strip()
    if len(cleaned) < MIN_TEXT_CHARS:
        raise AppError(
            "TEXT_TOO_SHORT",
            f"Add a bit more detail — at least {MIN_TEXT_CHARS} characters.",
            status=422,
        )
    if len(cleaned) > MAX_TEXT_CHARS:
        raise AppError(
            "TEXT_TOO_LONG",
            f"Keep your background under {MAX_TEXT_CHARS:,} characters.",
            status=422,
        )
    return cleaned


def extract_pdf_text(data: bytes, filename: str | None, content_type: str | None) -> str:
    name_ok = (filename or "").lower().endswith(".pdf")
    type_ok = content_type in (None, "", "application/pdf", "application/x-pdf", "application/octet-stream")
    if not name_ok or not type_ok:
        raise AppError("INVALID_FILE_TYPE", "Choose a PDF file.", status=422)
    if len(data) > MAX_PDF_BYTES:
        raise AppError("FILE_TOO_LARGE", "This PDF is larger than 5 MB.", status=422)
    if not data.startswith(b"%PDF"):
        raise AppError("INVALID_PDF", "This file doesn't look like a valid PDF.", status=422)
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise AppError("PDF_ENCRYPTED", "This PDF is password-protected. Paste text instead.", status=422)
        if len(reader.pages) > MAX_PDF_PAGES:
            raise AppError("PDF_TOO_MANY_PAGES", "This PDF has more than 10 pages.", status=422)
        fallback_pages = [(page.extract_text() or "") for page in reader.pages]
    except AppError:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError, OSError) as exc:
        logger.info("PDF parse failed: %s", type(exc).__name__)
        raise AppError("INVALID_PDF", "This PDF couldn't be read. Paste text instead.", status=422) from exc

    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            extracted_pages = [
                page.extract_text(x_tolerance=2, y_tolerance=3, layout=False) or "" for page in pdf.pages
            ]
    except Exception as exc:  # Third-party parsers raise several format-specific exception types.
        logger.info("pdfplumber extraction failed (%s); using pypdf fallback", type(exc).__name__)
        extracted_pages = fallback_pages

    pages: list[str] = []
    missing_pages: list[int] = []
    for index, fallback in enumerate(fallback_pages):
        primary = extracted_pages[index] if index < len(extracted_pages) else ""
        page_text = _normalize_extracted_text(primary)
        fallback_text = _normalize_extracted_text(fallback)
        if len(fallback_text) > len(page_text):
            page_text = fallback_text
        pages.append(page_text)
        if len(page_text) < MIN_PAGE_TEXT_CHARS:
            missing_pages.append(index)

    if missing_pages:
        try:
            ocr_pages = _ocr_pdf_pages(data, missing_pages)
            for index, ocr_text in zip(missing_pages, ocr_pages, strict=True):
                normalized = _normalize_extracted_text(ocr_text)
                if len(normalized) > len(pages[index]):
                    pages[index] = normalized
        except Exception as exc:  # OCR failures should still produce a safe validation response.
            logger.warning("PDF OCR failed: %s", type(exc).__name__)

    text = _normalize_extracted_text("\n".join(pages))
    if len(text) < MIN_TEXT_CHARS:
        raise AppError(
            "PDF_NO_TEXT",
            "We couldn't find readable text in this PDF, including with OCR. Paste text instead.",
            status=422,
        )
    return text[:MAX_TEXT_CHARS]


def _ocr_pdf_pages(data: bytes, page_indexes: list[int]) -> list[str]:
    global _ocr_engine

    import numpy as np
    import pypdfium2 as pdfium
    from rapidocr import RapidOCR

    results: list[str] = []
    document = pdfium.PdfDocument(data)
    try:
        with _ocr_lock:
            tesseract = shutil.which("tesseract")
            for index in page_indexes:
                page = document[index]
                try:
                    image = page.render(scale=OCR_RENDER_SCALE).to_pil()
                    text = ""
                    if tesseract:
                        buffer = io.BytesIO()
                        image.save(buffer, format="PNG")
                        try:
                            completed = subprocess.run(
                                [tesseract, "stdin", "stdout", "--dpi", "300", "--psm", "6", "-l", "eng"],
                                input=buffer.getvalue(),
                                capture_output=True,
                                timeout=30,
                                check=True,
                            )
                            text = completed.stdout.decode("utf-8", errors="replace")
                        except (OSError, subprocess.SubprocessError):
                            logger.info("Tesseract OCR failed on page %d; using RapidOCR", index + 1)
                    if not text.strip():
                        if _ocr_engine is None:
                            _ocr_engine = RapidOCR()
                        output = _ocr_engine(np.asarray(image))
                        texts = output.txts or ()
                        scores = output.scores or ()
                        text = "\n".join(
                            item for item, score in zip(texts, scores, strict=True) if score >= 0.4
                        )
                    results.append(text)
                finally:
                    page.close()
    finally:
        document.close()
    return results


def _normalize_extracted_text(text: str) -> str:
    lines = []
    for line in text.replace("\x00", "").replace("\u00a0", " ").replace("\u00ad", "").splitlines():
        cleaned = re.sub(r"[ \t]+", " ", line).strip()
        if cleaned:
            lines.append(cleaned)
    return "\n".join(lines).strip()


def _clean(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value[:limit] if value else None


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:12]}"


async def extract_profile(gateway: Gateway, text: str) -> Profile:
    extracted = await gateway.structured(
        instructions=EXTRACT_INSTRUCTIONS,
        input=f"<data>\n{text}\n</data>",
        model=ExtractedProfile,
        name="student_profile",
    )
    skills: list[str] = []
    for skill in extracted.skills:
        skill = skill.strip()[:60]
        if skill and skill.lower() not in {s.lower() for s in skills}:
            skills.append(skill)
    experiences = [
        Experience(id=new_id("exp"), title=exp.title.strip()[:120], description=exp.description.strip()[:500])
        for exp in extracted.experiences
        if exp.title.strip()
    ][:8]
    return Profile(
        id=new_id("prof"),
        version=0,
        name=_clean(extracted.name, 120),
        institution=_clean(extracted.institution, 200),
        degree_year=_clean(extracted.degree_year, 120),
        major=_clean(extracted.major, 200),
        skills=skills[:15],
        experiences=experiences,
        preferences=Preferences(),
        confirmed=False,
    )
