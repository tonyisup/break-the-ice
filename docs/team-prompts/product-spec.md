# Team Prompts: Product and Engineering Spec

Team Prompts lets a Team workspace plan the conversations it wants to have. A
manager can schedule an exact question or describe a topic, review generated
question candidates, and choose the final wording before publishing the week.

## Problem

The weekly scheduler can currently assign questions from the shared public
pool. That works when the right prompt already exists, but facilitators often
need to address organization-specific moments such as a launch, a leadership
change, or a retrospective. Leaving the scheduler to author a question on a
different screen breaks the planning flow. Generating a question only when a
coach opens the daily view would create a worse problem: the manager would not
know what the coach is about to ask.

Team Prompts keeps creation inside the weekly plan and makes the published
schedule deterministic. Coaches always see wording that a manager reviewed.

## Product model

The feature exposes three concepts:

- **Question:** exact wording the coach will use.
- **Team topic:** reusable organization context that can produce question
  candidates. It records a name, guidance, and optional boundaries.
- **Schedule assignment:** the final question selected for one delivery day.

The public question library remains a fourth source of exact questions. It does
not become organization-owned when assigned.

```text
Public library question --------------------+
                                             |
Manager-written question -------------------+--> exact schedule assignment
                                             |
Team topic --> three previews --> selection-+
```

## User experience

When a manager selects an empty day, the planner offers three paths:

1. **Library:** select an existing public question from the question matrix.
2. **Write a question:** enter exact wording and assign it immediately.
3. **Start from a topic:** describe the desired conversation, generate three
   candidates, edit or select one, then assign the selected wording.

Topic input contains:

- A short topic name.
- Guidance that describes what the conversation should surface.
- Optional boundaries that describe what the prompt should avoid.
- A style and tone used for generation.

Selecting a topic candidate saves both the reusable team topic and an
organization-private exact question. The schedule references the exact question
and records the team topic as provenance.

## Publishing contract

A published schedule contains only exact question assignments. Topic text is
never resolved when the coach opens the daily view.

This contract provides:

- Predictable wording for coaches.
- A review point for sensitive or organization-specific content.
- Stable feedback attribution to the question that was actually asked.
- Independence from AI provider availability during a live session.

Published schedules remain immutable through the existing scheduler rules. A
manager must make changes while the schedule is still a draft.

## Roles and plan access

- Organization admins and managers can create, generate, assign, remove, and
  publish Team Prompts.
- Organization members can read the published prompt through the coach view and
  submit feedback.
- Team topics and manager-authored questions are private to their organization.
- Team Prompt creation requires an active Team workspace. Existing public feed
  and personal-question behavior remains unchanged.

## Data and service design

### Team topics

A team topic stores:

- `organizationId`
- `name`
- `guidance`
- optional `boundaries`
- `createdBy`
- `createdAt` and `updatedAt`

Topics are listed by organization and may later power templates, recurrence,
and organization-specific recommendations.

### Exact questions

Manager-authored and topic-selected questions reuse the existing `questions`
table:

- `organizationId` scopes the question to the workspace.
- `customText` stores the reviewed wording.
- `kind: "team_prompt"` distinguishes schedule-managed prompts from personal
  questions.
- `status: "private"` prevents it from entering the public pool.
- `authorId` records the manager who accepted it.

Team Prompts do not appear in the creator's personal-question library and cannot
be edited, deleted, or made public through personal-question mutations.
User-account cleanup also preserves Team-owned question rows.

### Schedule provenance

`scheduledQuestions.teamTopicId` optionally identifies the topic that produced
the selected question. The assignment still requires `questionId`, so every
downstream reader retains provenance. `questionTextSnapshot` stores the reviewed
exact wording so delivery remains deterministic if the source question or author
later becomes unavailable.

### Topic preview generation

The preview action:

1. Verifies the caller is an admin or manager in an active Team workspace.
2. Validates and bounds topic input.
3. Reserves one unit from the workspace's AI generation allowance.
4. Uses the existing prompt architecture with the selected style and tone.
5. Includes topic guidance and boundaries as generation context.
6. Returns exactly three distinct persistable candidates without adding them to
   the public question pool.

Failed provider calls release the reserved usage unit.

The chosen candidate is persisted only when the manager assigns it.

## Validation and failure behavior

- Empty questions and topic names are rejected.
- Question and topic fields have server-enforced length limits.
- A question can only be assigned to a draft schedule in the same organization.
- A custom question cannot be assigned to another organization's schedule.
- Shared question readers do not reveal unpublished Team Prompt wording to
  members, including the original author after a role change.
- Topic previews do not modify a schedule.
- Topic previews fail and release reserved usage when fewer than three distinct,
  persistable candidates remain after validation.
- A failed preview leaves the current draft and existing assignments unchanged.
- Preview candidates that exceed the exact-question persistence limit are not
  returned as selectable options.
- Organization-owned styles and tones can be used only by their owning
  workspace; global taxonomy records remain available to every workspace.
- Draft Team Prompt assignments are readable only by admins and managers;
  members receive the exact wording after publication.
- Reassigning a day replaces its prior assignment through the existing
  one-question-per-day behavior.

## Success measures

The initial release should instrument:

- Team workspaces that create their first custom prompt.
- Draft schedules that reach publication after using a custom prompt.
- Share of assigned prompts from library, direct writing, and topics.
- Topic preview-to-assignment conversion.
- Repeat use of a saved team topic.
- Coach feedback rates and “landed well” rates by prompt source.

## Delivery plan

### Initial release

- Inline organization-private question creation.
- Three-candidate topic previews.
- Exact-question selection before assignment.
- Reusable team-topic records and assignment provenance.
- Manager permissions, Team entitlement checks, and regression tests.

### Follow-up

- Pick from previously saved team topics.
- Edit and archive team topics.
- Copy a prior week or save a week as a template.
- Feedback-informed topic recommendations.

### Later

- Recurring programming such as “connection every Monday.”
- Multi-week campaigns for onboarding, retrospectives, or leadership programs.
- Delivery integrations while preserving the exact-question publishing
  contract.

## Trade-offs

The first release saves a topic only when a candidate is accepted. This avoids
filling the team library with abandoned experiments, but it means a manager
cannot save an unfinished topic draft yet.

Generated candidates are not persisted until selection. This reduces clutter
and prevents preview text from leaking into the public pool, but generation-run
history remains the only audit record for rejected candidates.

The scheduler continues to hold one prompt per active delivery day. Supporting
multiple prompts per day would affect coach display, feedback attribution, and
publishing completeness, so it is separate scope.

## Related documentation

- [How to schedule a Team Prompt](how-to-schedule-team-prompts.md)
- [Team Prompts reference](reference.md)
