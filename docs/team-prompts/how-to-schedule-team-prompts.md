# How to schedule a Team Prompt

Use the weekly planner to assign a library question, write exact wording, or
turn a custom topic into a reviewed question for a specific delivery day.

## Prerequisites

- An active Team workspace.
- An organization role of admin or manager.
- At least one active delivery day in the workspace schedule settings.
- At least one active style and tone to generate topic options.

## Schedule a question from the library

1. Open **Team → Weekly schedule**.
2. Create or open a draft week.
3. Select **Assign** on an empty delivery day.
4. Leave the prompt composer on **Library**.
5. Find a question in the question matrix and select **Assign**.

The selected question appears in the day card immediately.

## Write and schedule an exact question

1. Select **Assign** on an empty delivery day.
2. Open the **Write** tab.
3. Enter the question exactly as the coach should ask it.
4. Select **Save and assign**.

The planner saves an organization-private question and assigns it to that day.
The question does not enter the public feed.

## Generate a question from a custom topic

1. Select **Assign** on an empty delivery day.
2. Open the **Topic** tab.
3. Enter a short topic name, such as `Launch readiness`.
4. Describe what the conversation should surface.
5. Optionally add boundaries, such as `Avoid asking people to name individual
owners`.
6. Select the style and tone.
7. Select **Generate three options**.
8. Select one candidate, then edit **Final wording** if needed.
9. Select **Use this question**.

The planner saves the topic for the workspace and assigns the final wording as
an exact private question. Regenerating does not change the schedule until you
select and accept a candidate.

## Publish the week

1. Confirm that every configured delivery day contains a question.
2. Review the exact wording in each day card.
3. Select **Publish**.

The coach view displays those exact questions on their scheduled days. Topic
generation does not run during the live session.

## Verification

- The selected day card shows the final wording.
- Topic-created assignments show a `Topic: …` badge in the draft planner.
- The week publishes only after all configured delivery days are filled.
- The coach view shows the same wording after publication.

## Troubleshooting

### “This feature requires an active Team workspace”

The selected organization does not have an active or trialing Team
subscription. Confirm that the correct workspace is selected and its billing
status is current.

### “User does not have the required role”

Only organization admins and managers can create or schedule Team Prompts. Ask
an organization admin to update your role.

### Topic generation is unavailable

Confirm the workspace has active styles and tones and that the server has its
AI provider credentials configured. A failed preview does not change the draft
schedule, so you can retry without removing an assignment.

### The week will not publish

Every active delivery day needs an exact question. Fill any empty day or update
delivery-day settings before creating a new schedule. Existing schedules retain
the delivery-day snapshot they were created with.

## Related documentation

- [Team Prompts product and engineering spec](product-spec.md)
- [Team Prompts reference](reference.md)
