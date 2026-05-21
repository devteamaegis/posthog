from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("user_interviews", "0005_remove_userinterviewtopic_interviewee_cohort_state"),
    ]

    operations = [
        migrations.AddField(
            model_name="intervieweecontext",
            name="is_test",
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.AddField(
            model_name="userinterview",
            name="is_test",
            field=models.BooleanField(db_default=False, default=False),
        ),
        migrations.AddConstraint(
            model_name="intervieweecontext",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_test", True)),
                fields=("topic",),
                name="unique_test_interviewee_per_topic",
            ),
        ),
    ]
