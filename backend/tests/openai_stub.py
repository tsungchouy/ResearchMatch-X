"""A tiny stand-in for the OpenAI Responses API, used only by tests.

It returns Responses-shaped JSON so the real SDK, request building and response
parsing are exercised without an API key. It is not a model and its content is fixed.
"""

from __future__ import annotations

import json
import re
from typing import Any

SCHOOL_PEOPLE = {
    "cmu.edu": ("Stub Professor Avery Lin", "Stub Interaction Lab", "https://www.cs.cmu.edu/~stub-lin"),
    "stanford.edu": ("Stub Professor Rowan Patel", "Stub Learning Group", "https://cs.stanford.edu/stub-patel"),
    "washington.edu": ("Stub Professor Casey Moreau", "Stub Robotics Studio", "https://www.cs.washington.edu/stub"),
}


def _envelope(output: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "id": "resp_stub",
        "object": "response",
        "created_at": 0,
        "model": "stub-model",
        "status": "completed",
        "output": output,
        "parallel_tool_calls": True,
        "tool_choice": "auto",
        "tools": [],
        "usage": {
            "input_tokens": 10,
            "output_tokens": 10,
            "total_tokens": 20,
            "input_tokens_details": {"cached_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        },
    }


def _message(text: str, annotations: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "type": "message",
        "id": "msg_stub",
        "role": "assistant",
        "status": "completed",
        "content": [{"type": "output_text", "text": text, "annotations": annotations or []}],
    }


def respond(body: dict[str, Any], fail_domains: set[str] | None = None) -> tuple[int, dict[str, Any]]:
    tools = body.get("tools") or []
    if tools:
        domain = tools[0]["filters"]["allowed_domains"][0]
        if domain in (fail_domains or set()):
            return 500, {"error": {"message": "stub failure", "type": "server_error"}}
        name, lab, url = SCHOOL_PEOPLE.get(domain, ("Stub Person", "Stub Lab", f"https://www.{domain}/stub"))
        join_url = url.rstrip("/") + "/join"
        text = (
            f"{name} leads the {lab}, which studies topics related to the student's interests. "
            "The lab page invites undergraduates to apply for Summer 2027 research positions."
        )
        return 200, _envelope(
            [
                {
                    "type": "web_search_call",
                    "id": "ws_stub",
                    "status": "completed",
                    "action": {
                        "type": "search",
                        "query": "faculty research",
                        "sources": [
                            {"type": "url", "url": url},
                            {"type": "url", "url": f"https://{domain}.example.com/spoof"},
                        ],
                    },
                },
                _message(
                    text,
                    [
                        {"type": "url_citation", "url": url, "title": f"{name} — faculty page", "start_index": 0, "end_index": 10},
                        {"type": "url_citation", "url": join_url, "title": "Join the lab", "start_index": 11, "end_index": 20},
                    ],
                ),
            ]
        )

    name = body.get("text", {}).get("format", {}).get("name")
    user_input = body.get("input") or ""
    if name == "student_profile":
        payload = {
            "name": None,
            "institution": "Stub University",
            "degree_year": "BS, junior",
            "major": "Computer Science",
            "skills": ["Python", "User research"],
            "experiences": [
                {"title": "Research assistant, campus HCI lab", "description": "Ran interview studies."},
                {"title": "Course project: accessible notes", "description": "Built a screen-reader friendly app."},
            ],
        }
    elif name == "school_candidates":
        exp_ids = re.findall(r"id=([A-Za-z0-9_-]+)", user_input)
        refs = re.findall(r"^(S\d+): (.*?) — (\S+)$", user_input, flags=re.MULTILINE)
        people = [line for line in refs if "faculty page" in line[1]]
        join = [line for line in refs if line[2].endswith("/join")]
        person_name = people[0][1].split(" — ")[0] if people else "Stub Person"
        payload = {
            "candidates": [
                {
                    "name": person_name,
                    "entity_type": "faculty",
                    "lab": "Stub lab",
                    "research_summary": "Studies interactive systems (stub data for automated tests).",
                    "fit_level": "strong",
                    "fit_reasons": [
                        {
                            "text": "Their interaction research connects to your interview-study experience.",
                            "experience_ids": exp_ids[:1],
                            "interest_terms": [],
                            "source_refs": [people[0][0]] if people else [],
                        }
                    ],
                    "recruitment": "recruiting_stated",
                    "recruitment_applies_to_undergraduates": True,
                    "recruitment_term_or_date": "Summer 2027",
                    "recruitment_explanation": "The lab page invites undergraduates to apply for Summer 2027.",
                    "recruitment_source_refs": [join[0][0]] if join else [],
                    "unknowns": ["Whether remote participation is possible"],
                    "conflicts": [],
                    "sources": [
                        {"ref": ref, "title": title, "summary": "Stub summary of the page.", "published_at": None}
                        for ref, title, _url in refs
                    ],
                }
            ]
        }
    elif name == "outreach_email":
        payload = {
            "subject": "Undergraduate research inquiry",
            "body": "Dear Professor Lin,\n\nI am a junior studying Computer Science. (Stub draft for automated tests.)"
            "\n\nBest regards,\n[Your name]",
        }
    else:
        return 400, {"error": {"message": f"unexpected request {name}", "type": "invalid_request_error"}}
    return 200, _envelope([_message(json.dumps(payload))])
