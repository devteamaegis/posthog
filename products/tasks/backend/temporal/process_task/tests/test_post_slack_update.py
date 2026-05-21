from unittest.mock import patch

from django.test import TestCase

from posthog.models.integration import Integration
from posthog.models.organization import Organization
from posthog.models.team.team import Team
from posthog.models.user import User
from posthog.models.user_integration import UserIntegration

from products.slack_app.backend.models import SlackThreadTaskMapping
from products.tasks.backend.models import Task, TaskRun
from products.tasks.backend.temporal.process_task.activities.post_slack_update import (
    PostSlackUpdateInput,
    post_slack_update,
)


class TestPostSlackUpdateGitHubWarning(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="TestOrg")
        self.team = Team.objects.create(organization=self.org, name="TestTeam")
        self.user = User.objects.create(email="alice@test.com")
        self.integration = Integration.objects.create(team=self.team, kind="slack", integration_id="T_SLACK", config={})
        self.task = Task.objects.create(
            team=self.team,
            created_by=self.user,
            title="Test Task",
            description="Test",
            origin_product=Task.OriginProduct.SLACK,
            repository="posthog/posthog",
        )
        self.task_run = TaskRun.objects.create(
            task=self.task,
            team=self.team,
            status=TaskRun.Status.IN_PROGRESS,
            output={"pr_url": "https://github.com/posthog/posthog/pull/1"},
        )
        SlackThreadTaskMapping.objects.create(
            team=self.team,
            integration=self.integration,
            slack_workspace_id="T_SLACK",
            channel="C123",
            thread_ts="1234.5678",
            task=self.task,
            task_run=self.task_run,
            mentioning_slack_user_id="U123",
        )

    def _make_input(self, sandbox_cleaned: bool = False) -> PostSlackUpdateInput:
        return PostSlackUpdateInput(
            run_id=str(self.task_run.id),
            slack_thread_context={
                "integration_id": self.integration.id,
                "channel": "C123",
                "thread_ts": "1234.5678",
                "mentioning_slack_user_id": "U123",
            },
            sandbox_cleaned=sandbox_cleaned,
        )

    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.update_reaction")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.delete_progress")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_pr_opened")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_thread_message")
    def test_warns_when_user_has_no_personal_github_on_pr_open(
        self, mock_post_thread_message, mock_post_pr_opened, _mock_delete, _mock_react
    ):
        post_slack_update(self._make_input())

        mock_post_pr_opened.assert_called_once()
        mock_post_thread_message.assert_called_once()
        warning_text = mock_post_thread_message.call_args.args[0]
        assert "haven't connected" in warning_text
        assert f"/project/{self.team.id}/settings/user-personal-integrations" in warning_text

    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.update_reaction")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.delete_progress")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_pr_opened")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_thread_message")
    def test_no_warning_when_user_has_personal_github(
        self, mock_post_thread_message, mock_post_pr_opened, _mock_delete, _mock_react
    ):
        UserIntegration.objects.create(
            user=self.user,
            kind="github",
            integration_id="gh-1",
            config={},
            sensitive_config={"access_token": "tok"},
        )

        post_slack_update(self._make_input())

        mock_post_pr_opened.assert_called_once()
        mock_post_thread_message.assert_not_called()

    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.update_reaction")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.delete_progress")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_pr_opened")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_thread_message")
    def test_warning_fires_only_once_per_pr(
        self, mock_post_thread_message, mock_post_pr_opened, _mock_delete, _mock_react
    ):
        post_slack_update(self._make_input())
        # Second invocation hits the already-notified guard and skips both PR + warning.
        self.task_run.refresh_from_db()
        post_slack_update(self._make_input())

        assert mock_post_pr_opened.call_count == 1
        assert mock_post_thread_message.call_count == 1

    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.update_reaction")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.delete_progress")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_pr_opened_sandbox_cleaned")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_thread_message")
    def test_warns_on_sandbox_cleaned_pr_open_path(
        self, mock_post_thread_message, mock_post_sandbox_cleaned, _mock_delete, _mock_react
    ):
        post_slack_update(self._make_input(sandbox_cleaned=True))

        mock_post_sandbox_cleaned.assert_called_once()
        mock_post_thread_message.assert_called_once()
        assert "haven't connected" in mock_post_thread_message.call_args.args[0]

    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.update_reaction")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_or_update_progress")
    @patch("products.slack_app.backend.slack_thread.SlackThreadHandler.post_thread_message")
    def test_no_warning_on_progress_only_path(self, mock_post_thread_message, _mock_progress, _mock_react):
        self.task_run.output = {}
        self.task_run.save(update_fields=["output"])

        post_slack_update(self._make_input())

        mock_post_thread_message.assert_not_called()
