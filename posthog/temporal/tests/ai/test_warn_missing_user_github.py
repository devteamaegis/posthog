from unittest.mock import MagicMock, patch

from django.apps import apps
from django.test import TestCase

from posthog.models.integration import Integration
from posthog.models.organization import Organization
from posthog.models.team.team import Team
from posthog.models.user import User
from posthog.models.user_integration import UserIntegration
from posthog.temporal.ai.posthog_code_slack_mention import (
    PostHogCodeSlackMentionWorkflowInputs,
    _post_user_github_warning_if_missing,
    create_posthog_code_task_for_repo_activity,
)


def _make_inputs(integration_id: int, slack_team_id: str = "T_SLACK") -> PostHogCodeSlackMentionWorkflowInputs:
    return PostHogCodeSlackMentionWorkflowInputs(
        event={"channel": "C123", "ts": "1234.5678", "user": "U_ALICE", "text": "<@BOT> do something"},
        integration_id=integration_id,
        slack_team_id=slack_team_id,
    )


class TestPostUserGithubWarningIfMissing(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="TestOrg")
        self.team = Team.objects.create(organization=self.org, name="TestTeam")
        self.user = User.objects.create(email="alice@test.com")

    def test_posts_warning_when_user_has_no_github_user_integration(self):
        mock_slack = MagicMock()
        _post_user_github_warning_if_missing(mock_slack, "C123", "1234.5678", self.user.id, self.team.id)

        mock_slack.client.chat_postMessage.assert_called_once()
        kwargs = mock_slack.client.chat_postMessage.call_args.kwargs
        assert kwargs["channel"] == "C123"
        assert kwargs["thread_ts"] == "1234.5678"
        assert "haven't connected" in kwargs["text"]
        assert f"/project/{self.team.id}/settings/user-personal-integrations" in kwargs["text"]

    def test_no_op_when_user_has_github_user_integration(self):
        UserIntegration.objects.create(
            user=self.user,
            kind="github",
            integration_id="gh-install-1",
            config={},
            sensitive_config={"access_token": "tok"},
        )
        mock_slack = MagicMock()
        _post_user_github_warning_if_missing(mock_slack, "C123", "1234.5678", self.user.id, self.team.id)

        mock_slack.client.chat_postMessage.assert_not_called()

    def test_only_github_kind_counts(self):
        UserIntegration.objects.create(
            user=self.user,
            kind="other-service",
            integration_id="x",
            config={},
            sensitive_config={},
        )
        mock_slack = MagicMock()
        _post_user_github_warning_if_missing(mock_slack, "C123", "1234.5678", self.user.id, self.team.id)

        mock_slack.client.chat_postMessage.assert_called_once()


class TestCreatePostHogCodeTaskWarningGate(TestCase):
    def setUp(self):
        self.Task = apps.get_model("tasks", "Task")
        self.org = Organization.objects.create(name="TestOrg")
        self.team = Team.objects.create(organization=self.org, name="TestTeam")
        self.user = User.objects.create(email="alice@test.com")
        self.integration = Integration.objects.create(team=self.team, kind="slack", integration_id="T_SLACK", config={})

    @patch("products.tasks.backend.temporal.client.execute_task_processing_workflow")
    @patch("posthog.models.integration.SlackIntegration")
    def test_no_warning_when_repository_is_none(self, mock_slack_cls, _mock_workflow):
        mock_slack = MagicMock()
        mock_slack.client.chat_getPermalink.return_value = {"ok": True, "permalink": "https://slack/x"}
        mock_slack_cls.return_value = mock_slack

        inputs = _make_inputs(self.integration.id)
        create_posthog_code_task_for_repo_activity(
            inputs,
            "C123",
            "1234.5678",
            "U_ALICE",
            self.user.id,
            inputs.event,
            [{"user": "U_ALICE", "text": "analytics please"}],
            None,
        )

        for call in mock_slack.client.chat_postMessage.call_args_list:
            assert "haven't connected" not in (call.kwargs.get("text") or "")

    @patch("products.tasks.backend.temporal.client.execute_task_processing_workflow")
    @patch("posthog.models.integration.SlackIntegration")
    def test_warning_when_repository_set_and_no_user_github(self, mock_slack_cls, _mock_workflow):
        mock_slack = MagicMock()
        mock_slack.client.chat_getPermalink.return_value = {"ok": True, "permalink": "https://slack/x"}
        mock_slack_cls.return_value = mock_slack

        inputs = _make_inputs(self.integration.id)
        create_posthog_code_task_for_repo_activity(
            inputs,
            "C123",
            "1234.5678",
            "U_ALICE",
            self.user.id,
            inputs.event,
            [{"user": "U_ALICE", "text": "fix the thing"}],
            "posthog/posthog",
        )

        warning_texts = [
            call.kwargs.get("text", "")
            for call in mock_slack.client.chat_postMessage.call_args_list
            if "haven't connected" in (call.kwargs.get("text") or "")
        ]
        assert len(warning_texts) == 1

    @patch("products.tasks.backend.temporal.client.execute_task_processing_workflow")
    @patch("posthog.models.integration.SlackIntegration")
    def test_no_warning_when_repository_set_but_user_has_github(self, mock_slack_cls, _mock_workflow):
        UserIntegration.objects.create(
            user=self.user,
            kind="github",
            integration_id="gh-install-1",
            config={},
            sensitive_config={"access_token": "tok"},
        )
        mock_slack = MagicMock()
        mock_slack.client.chat_getPermalink.return_value = {"ok": True, "permalink": "https://slack/x"}
        mock_slack_cls.return_value = mock_slack

        inputs = _make_inputs(self.integration.id)
        create_posthog_code_task_for_repo_activity(
            inputs,
            "C123",
            "1234.5678",
            "U_ALICE",
            self.user.id,
            inputs.event,
            [{"user": "U_ALICE", "text": "fix the thing"}],
            "posthog/posthog",
        )

        for call in mock_slack.client.chat_postMessage.call_args_list:
            assert "haven't connected" not in (call.kwargs.get("text") or "")
