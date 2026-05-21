from django.db import migrations, models


class Migration(migrations.Migration):
    """Store the synthetic test interviewee's latest call directly on the topic.

    A test call has no per-person config (the "user" is fixed) and no need for a
    persisted SharingConfiguration: the test URL is derivable from the topic UUID.
    The only state we keep is the latest transcript / summary / recording, on the
    topic itself — each completed test call overwrites the previous one.
    """

    dependencies = [
        ("user_interviews", "0005_remove_userinterviewtopic_interviewee_cohort_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="userinterviewtopic",
            name="test_transcript",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="userinterviewtopic",
            name="test_summary",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="userinterviewtopic",
            name="test_recording_url",
            field=models.URLField(blank=True, default="", max_length=2048),
        ),
        migrations.AddField(
            model_name="userinterviewtopic",
            name="test_call_completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
