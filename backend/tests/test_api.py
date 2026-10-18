import time

from app.config import Settings, get_settings
from app.main import create_app
from app.services import profile as profile_service
from fastapi.testclient import TestClient

from .conftest import RESUME_TEXT, extract_and_confirm, make_pdf, new_session, wait_for_job


def test_health_reports_configuration(client):
    assert client.get("/api/health").json() == {"status": "ok", "liveConfigured": True}


def test_live_not_configured_fails_honestly():
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings()
    with TestClient(app) as c:
        assert c.get("/api/health").json()["liveConfigured"] is False
        response = c.post("/api/profile/extract", data={"text": RESUME_TEXT}, headers=new_session())
        assert response.status_code == 503
        body = response.json()["error"]
        assert body["code"] == "LIVE_NOT_CONFIGURED"
        assert set(body) == {"code", "message", "retryable", "requestId"}


def test_session_header_required(client):
    response = client.post("/api/profile/extract", data={"text": RESUME_TEXT})
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "SESSION_REQUIRED"
    short = client.post("/api/profile/extract", data={"text": RESUME_TEXT}, headers={"X-Session-ID": "abc"})
    assert short.status_code == 400


def test_extract_text_assigns_backend_ids_and_dedupes(client):
    response = client.post("/api/profile/extract", data={"text": RESUME_TEXT}, headers=new_session())
    assert response.status_code == 200
    profile = response.json()
    assert profile["confirmed"] is False and profile["version"] == 0
    assert profile["skills"] == ["Python", "React", "User studies"]
    assert all(exp["id"].startswith("exp-") for exp in profile["experiences"])


def test_extract_requires_exactly_one_input(client):
    headers = new_session()
    both = client.post(
        "/api/profile/extract",
        data={"text": RESUME_TEXT},
        files={"file": ("cv.pdf", make_pdf(RESUME_TEXT), "application/pdf")},
        headers=headers,
    )
    assert both.status_code == 422 and both.json()["error"]["code"] == "INVALID_INPUT"
    neither = client.post("/api/profile/extract", data={}, headers=headers)
    assert neither.status_code == 422
    short = client.post("/api/profile/extract", data={"text": "too short"}, headers=headers)
    assert short.json()["error"]["code"] == "TEXT_TOO_SHORT"


def test_pdf_validation(client, monkeypatch):
    headers = new_session()
    ok = client.post(
        "/api/profile/extract", files={"file": ("cv.pdf", make_pdf(RESUME_TEXT), "application/pdf")}, headers=headers
    )
    assert ok.status_code == 200, ok.text
    not_pdf = client.post(
        "/api/profile/extract", files={"file": ("cv.pdf", b"hello world" * 20, "application/pdf")}, headers=headers
    )
    assert not_pdf.json()["error"]["code"] == "INVALID_PDF"
    wrong_type = client.post(
        "/api/profile/extract", files={"file": ("cv.txt", b"%PDF-1.4", "text/plain")}, headers=headers
    )
    assert wrong_type.json()["error"]["code"] == "INVALID_FILE_TYPE"
    too_many = client.post(
        "/api/profile/extract",
        files={"file": ("cv.pdf", make_pdf(RESUME_TEXT, pages=11), "application/pdf")},
        headers=headers,
    )
    assert too_many.json()["error"]["code"] == "PDF_TOO_MANY_PAGES"
    monkeypatch.setattr(profile_service, "_ocr_pdf_pages", lambda _data, indexes: ["" for _ in indexes])
    no_text = client.post(
        "/api/profile/extract", files={"file": ("cv.pdf", make_pdf(" "), "application/pdf")}, headers=headers
    )
    assert no_text.json()["error"]["code"] == "PDF_NO_TEXT"
    big = client.post(
        "/api/profile/extract",
        files={"file": ("cv.pdf", b"%PDF" + b"0" * (5 * 1024 * 1024 + 10), "application/pdf")},
        headers=headers,
    )
    assert big.json()["error"]["code"] == "FILE_TOO_LARGE"


def test_scanned_pdf_uses_ocr(monkeypatch):
    ocr_text = "Scanned resume with Python, machine learning, research, and project experience. " * 2
    monkeypatch.setattr(profile_service, "_ocr_pdf_pages", lambda _data, indexes: [ocr_text for _ in indexes])
    extracted = profile_service.extract_pdf_text(make_pdf(" "), "scan.pdf", "application/pdf")
    assert extracted == ocr_text.strip()


def test_confirm_validation_and_versions(client):
    headers = new_session()
    profile = client.post("/api/profile/extract", data={"text": RESUME_TEXT}, headers=headers).json()
    no_interest = client.post("/api/profile/confirm", json=profile, headers=headers)
    assert no_interest.status_code == 422
    assert "research interest" in no_interest.json()["error"]["message"]
    profile["preferences"]["interests"] = ["HCI"]
    for blank in (None, "   "):
        no_name = client.post("/api/profile/confirm", json={**profile, "name": blank}, headers=headers)
        assert no_name.status_code == 422
        assert no_name.json()["error"]["message"] == "Add your name."
    profile["preferences"].update(startMonth="2027-06", endMonth="2027-01")
    bad_dates = client.post("/api/profile/confirm", json=profile, headers=headers)
    assert "end month" in bad_dates.json()["error"]["message"]
    profile["preferences"]["endMonth"] = "2027-08"
    first = client.post("/api/profile/confirm", json=profile, headers=headers).json()
    assert first["version"] == 1 and first["confirmed"] is True
    second = client.post("/api/profile/confirm", json=first, headers=headers).json()
    assert second["version"] == 2


def test_search_happy_path_filters_sources_and_does_not_send_name(client, gateway):
    headers = new_session()
    profile = extract_and_confirm(client, headers, schools=("cmu", "uw"))
    response = client.post(
        "/api/search", json={"profileId": profile["id"], "profileVersion": profile["version"]}, headers=headers
    )
    assert response.status_code == 202
    job = wait_for_job(client, headers, response.json()["jobId"])
    assert job["status"] == "complete"
    assert [s["status"] for s in job["schools"]] == ["complete", "complete"]
    assert 0 < len(job["candidates"]) <= 5
    for cand in job["candidates"]:
        assert cand["mode"] == "live"
        for source in cand["sources"]:
            assert "example.com" not in source["url"]
    assert job["retrievedAt"]
    assert all("Alex" not in text for text in gateway.search_inputs)


def test_search_requires_current_confirmed_version(client):
    headers = new_session()
    profile = extract_and_confirm(client, headers)
    stale = client.post("/api/search", json={"profileId": profile["id"], "profileVersion": 99}, headers=headers)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "PROFILE_VERSION_MISMATCH"
    unknown = client.post("/api/search", json={"profileId": "prof-nope", "profileVersion": 1}, headers=headers)
    assert unknown.json()["error"]["code"] == "PROFILE_NOT_CONFIRMED"


def test_idempotent_search_does_not_create_duplicate_jobs(client, gateway):
    headers = new_session() | {"Idempotency-Key": "key-1"}
    profile = extract_and_confirm(client, headers)
    payload = {"profileId": profile["id"], "profileVersion": profile["version"]}
    first = client.post("/api/search", json=payload, headers=headers).json()
    second = client.post("/api/search", json=payload, headers=headers).json()
    assert first == second
    wait_for_job(client, headers, first["jobId"])
    assert gateway.calls.count("search:cmu.edu") == 1
    conflict = client.post("/api/search", json={**payload, "profileVersion": 2}, headers=headers)
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] in {"IDEMPOTENCY_CONFLICT", "PROFILE_VERSION_MISMATCH"}


def test_idempotency_conflict_with_different_payload(client):
    headers = new_session()
    profile = extract_and_confirm(client, headers)
    profile2 = client.post("/api/profile/confirm", json=profile, headers=headers).json()
    keyed = headers | {"Idempotency-Key": "same"}
    client.post("/api/search", json={"profileId": profile2["id"], "profileVersion": 2}, headers=keyed)
    profile3 = client.post("/api/profile/confirm", json=profile2, headers=headers).json()
    conflict = client.post("/api/search", json={"profileId": profile3["id"], "profileVersion": 3}, headers=keyed)
    assert conflict.status_code == 409 and conflict.json()["error"]["code"] == "IDEMPOTENCY_CONFLICT"


def test_session_isolation(client):
    owner, other = new_session(), new_session()
    profile = extract_and_confirm(client, owner)
    job_id = client.post(
        "/api/search", json={"profileId": profile["id"], "profileVersion": 1}, headers=owner
    ).json()["jobId"]
    assert client.get(f"/api/search/{job_id}", headers=other).status_code == 404
    foreign_search = client.post("/api/search", json={"profileId": profile["id"], "profileVersion": 1}, headers=other)
    assert foreign_search.status_code == 409
    foreign_confirm = client.post("/api/profile/confirm", json=profile, headers=other)
    assert foreign_confirm.status_code == 404


def test_partial_failure_then_retry_only_failed_school(client, gateway):
    gateway.fail_domains = {"stanford.edu"}
    headers = new_session()
    profile = extract_and_confirm(client, headers, schools=("cmu", "stanford"))
    job_id = client.post(
        "/api/search", json={"profileId": profile["id"], "profileVersion": 1}, headers=headers
    ).json()["jobId"]
    job = wait_for_job(client, headers, job_id)
    assert job["status"] == "partial"
    stanford = next(s for s in job["schools"] if s["schoolId"] == "stanford")
    assert stanford["status"] == "failed" and stanford["errorCode"] == "SEARCH_TIMEOUT"
    original_ids = [c["id"] for c in job["candidates"]]

    not_failed = client.post(f"/api/search/{job_id}/retry", json={"schoolIds": ["cmu"]}, headers=headers)
    assert not_failed.status_code == 409

    gateway.fail_domains = set()
    calls_before = gateway.calls.count("search:cmu.edu")
    extracts_before = gateway.calls.count("student_profile")
    retry = client.post(f"/api/search/{job_id}/retry", json={"schoolIds": ["stanford"]}, headers=headers)
    assert retry.status_code == 202
    retried = wait_for_job(client, headers, retry.json()["jobId"])
    assert retried["status"] == "complete" and retried["retryOf"] == job_id
    assert gateway.calls.count("search:cmu.edu") == calls_before
    assert gateway.calls.count("student_profile") == extracts_before
    new_ids = [c["id"] for c in retried["candidates"]]
    assert set(original_ids) <= set(new_ids)
    assert any(c["schoolId"] == "stanford" for c in retried["candidates"])


def test_all_schools_failed_and_no_search_call(client, gateway):
    gateway.fail_domains = {"cmu.edu"}
    gateway.no_search_domains = {"uw.edu", "washington.edu"}
    headers = new_session()
    profile = extract_and_confirm(client, headers, schools=("cmu", "uw"))
    job_id = client.post(
        "/api/search", json={"profileId": profile["id"], "profileVersion": 1}, headers=headers
    ).json()["jobId"]
    job = wait_for_job(client, headers, job_id)
    assert job["status"] == "failed"
    assert job["candidates"] == []
    uw = next(s for s in job["schools"] if s["schoolId"] == "uw")
    assert uw["errorCode"] == "NO_SEARCH_PERFORMED"


def test_cancel_stops_later_schools(client, gateway):
    gateway.delay_s = 0.3
    headers = new_session()
    profile = extract_and_confirm(client, headers, schools=("cmu", "stanford", "uw"))
    job_id = client.post(
        "/api/search", json={"profileId": profile["id"], "profileVersion": 1}, headers=headers
    ).json()["jobId"]
    time.sleep(0.05)
    cancelled = client.post(f"/api/search/{job_id}/cancel", headers=headers).json()
    assert cancelled["status"] == "cancelled"
    time.sleep(0.5)
    job = client.get(f"/api/search/{job_id}", headers=headers).json()
    assert job["status"] == "cancelled" and job["candidates"] == []
    assert "search:stanford.edu" not in gateway.calls


def _completed_job(client, headers):
    profile = extract_and_confirm(client, headers)
    job_id = client.post(
        "/api/search", json={"profileId": profile["id"], "profileVersion": 1}, headers=headers
    ).json()["jobId"]
    return profile, wait_for_job(client, headers, job_id)


def _draft_payload(profile, job, **overrides):
    payload = {
        "profileId": profile["id"],
        "profileVersion": profile["version"],
        "jobId": job["id"],
        "candidateId": job["candidates"][0]["id"],
        "selectedExperienceIds": [profile["experiences"][0]["id"]],
        "educationOnly": False,
        "userRequest": "Is there a way to get involved next summer?",
        "signatureName": "",
        "availability": "June–August 2027",
        "reviewConfirmed": True,
    }
    payload.update(overrides)
    return payload


def test_draft_generation_and_guards(client):
    headers = new_session()
    profile, job = _completed_job(client, headers)
    ok = client.post("/api/draft", json=_draft_payload(profile, job), headers=headers)
    assert ok.status_code == 200, ok.text
    draft = ok.json()
    assert draft["candidateId"] == job["candidates"][0]["id"]
    assert "[Your name]" in draft["body"]
    assert "a@b.com" not in draft["body"]

    unreviewed = client.post("/api/draft", json=_draft_payload(profile, job, reviewConfirmed=False), headers=headers)
    assert unreviewed.json()["error"]["code"] == "REVIEW_REQUIRED"
    foreign_exp = client.post(
        "/api/draft", json=_draft_payload(profile, job, selectedExperienceIds=["exp-other"]), headers=headers
    )
    assert foreign_exp.json()["error"]["code"] == "INVALID_EXPERIENCE"
    both = client.post("/api/draft", json=_draft_payload(profile, job, educationOnly=True), headers=headers)
    assert both.json()["error"]["code"] == "INVALID_SELECTION"
    edu_only = client.post(
        "/api/draft", json=_draft_payload(profile, job, educationOnly=True, selectedExperienceIds=[]), headers=headers
    )
    assert edu_only.status_code == 200
    missing = client.post("/api/draft", json=_draft_payload(profile, job, candidateId="cand-x"), headers=headers)
    assert missing.json()["error"]["code"] == "CANDIDATE_NOT_FOUND"


def test_draft_rejects_old_profile_version(client):
    headers = new_session()
    profile, job = _completed_job(client, headers)
    newer = client.post("/api/profile/confirm", json=profile, headers=headers).json()
    assert newer["version"] == 2
    stale = client.post("/api/draft", json=_draft_payload(profile, job), headers=headers)
    assert stale.status_code == 409 and stale.json()["error"]["code"] == "PROFILE_VERSION_MISMATCH"
    old_job = client.post("/api/draft", json=_draft_payload(newer, job), headers=headers)
    assert old_job.json()["error"]["code"] == "STALE_SEARCH"


def test_errors_do_not_leak_internals(client, gateway):
    async def boom(**_kwargs):
        raise RuntimeError("sk-secret stack detail")

    gateway.structured = boom  # type: ignore[method-assign]
    response = client.post("/api/profile/extract", data={"text": RESUME_TEXT}, headers=new_session())
    assert response.status_code == 500
    assert "sk-secret" not in response.text
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
