"""Business logic for user_interviews.

Holds the parsing rules and ORM queries that back the facade. The facade
(`facade/api.py`) stays thin and delegates here; tests and other internal
modules within this product may call these helpers directly, but external
products must keep going through the facade.
"""

import re
from typing import Any
from uuid import UUID

from posthog.utils import absolute_uri

from products.user_interviews.backend.facade.contracts import IntervieweeIdentity
from products.user_interviews.backend.models import EmailWithDisplayNameValidator, UserInterview, UserInterviewTopic

# The synthetic test interviewee is a known, single, fixed identity — it has no
# per-person config, no email, no distinct ID. The display name is used only for the
# greeting in the voice agent's first message.
TEST_INTERVIEWEE_DISPLAY_NAME = "Test interviewee"

# Prefix on the public URL token that signals "this is the synthetic test interviewee on
# topic <uuid>" rather than "this is a SharingConfiguration access_token". The URL is
# fully derivable from the topic UUID — no SharingConfiguration row is created or stored.
TEST_INTERVIEW_TOKEN_PREFIX = "test-"


def build_test_interview_token(topic_id: Any) -> str:
    """Deterministic public-URL token for a topic's synthetic test interviewee.
    `topic_id` is an unguessable UUID, so the resulting URL is as private as the topic itself."""
    return f"{TEST_INTERVIEW_TOKEN_PREFIX}{topic_id}"


def build_test_link_payload(*, topic: UserInterviewTopic) -> dict[str, Any]:
    """Render the response shape for the test-link endpoint and the Max tool.

    Lives here (not in `presentation/views.py`) so the Max tool can use it without
    creating a cycle through `facade.api` → `max_tools` → `presentation.views`.
    """
    snapshot: dict[str, Any] | None = None
    if topic.test_call_completed_at is not None:
        snapshot = {
            "completed_at": topic.test_call_completed_at,
            "transcript": topic.test_transcript or "",
            "summary": topic.test_summary or "",
            "recording_url": topic.test_recording_url or "",
        }
    return {
        "interview_url": absolute_uri(f"/interview/{build_test_interview_token(topic.id)}"),
        "agent_context": topic.agent_context or "",
        "latest_test_interview": snapshot,
    }


def parse_interviewee_identifier(identifier: str) -> IntervieweeIdentity:
    """Split an interviewee identifier into a display name and (optional) email.

    Accepts the same display-name format the topic validator accepts —
    ``"Display Name <email@host>"`` — falling back to a best-effort
    title-cased local-part for raw emails and the identifier as-is for
    distinct IDs.
    """
    identifier = identifier.strip()
    display_match = re.match(EmailWithDisplayNameValidator.display_name_regex, identifier)
    if display_match:
        return IntervieweeIdentity(
            display_name=display_match.group(1).strip(),
            email=display_match.group(2).strip(),
        )
    if "@" in identifier:
        local_part = identifier.split("@", 1)[0]
        return IntervieweeIdentity(
            display_name=local_part.replace(".", " ").replace("_", " ").strip().title() or identifier,
            email=identifier,
        )
    return IntervieweeIdentity(display_name=identifier, email=None)


def has_replied(*, team_id: int, topic_id: UUID, interviewee_identifier: str) -> bool:
    """Whether an interviewee has already completed an interview for this topic."""
    return UserInterview.objects.filter(
        team_id=team_id,
        topic_id=topic_id,
        interviewee_identifier=interviewee_identifier,
    ).exists()
