# Team Prompts Reference

Team Prompts extends weekly organization schedules with private exact questions,
custom-topic previews, reusable topic records, and topic provenance.

## User interface

Selecting **Assign** on an editable schedule day opens the prompt composer.

| Mode    | Input                                             | Persistence                                               |
| ------- | ------------------------------------------------- | --------------------------------------------------------- |
| Library | Existing question ID                              | Schedule assignment only                                  |
| Write   | Exact question text                               | Private organization question and assignment              |
| Topic   | Topic fields, style, tone, selected final wording | Team topic, private organization question, and assignment |

The composer is available only for a missing assignment on a draft or not-yet-
created week. Published schedules use the existing immutable schedule behavior.

## Convex API

### `core.teamPromptActions.previewTopicQuestions`

Generates reviewed candidates without adding them to the question pool or
changing a schedule.

Arguments:

| Field            | Type                  | Constraint                                        |
| ---------------- | --------------------- | ------------------------------------------------- |
| `organizationId` | `Id<"organizations">` | Caller must be a paid admin or manager            |
| `name`           | `string`              | Required after trimming; maximum 100 characters   |
| `guidance`       | `string`              | Required after trimming; maximum 1,000 characters |
| `boundaries`     | `string?`             | Optional; maximum 1,000 characters                |
| `styleId`        | `Id<"styles">`        | Active; global or owned by the same organization  |
| `toneId`         | `Id<"tones">`         | Active; global or owned by the same organization  |

Return value:

```ts
{
  questions: string[];
  runId: Id<"generationRuns">;
}
```

The action requests three candidates and reserves one unit of the workspace's AI
usage before calling the provider. A failed provider call releases that
reservation. Provider output or parsing can produce fewer than three returned
strings. Empty candidates and candidates over the 500-character persistence
limit are discarded before return. `runId` identifies the generation audit
record.

### `core.teamPrompts.createAndAssign`

Atomically creates an exact private question and assigns it to one draft
schedule day. When `sourceTopic` is present, the mutation also creates a team
topic and records its ID on the assignment.

Arguments:

```ts
{
  scheduleId: Id<"schedules">;
  dayOfWeek:
    | "monday" | "tuesday" | "wednesday" | "thursday"
    | "friday" | "saturday" | "sunday";
  questionText: string;
  sourceTopic?: {
    name: string;
    guidance: string;
    boundaries?: string;
  };
}
```

Constraints:

- The caller must be an admin or manager in an active Team workspace.
- The schedule must exist and have `status: "draft"`.
- `dayOfWeek` must belong to the schedule's delivery-day snapshot.
- `questionText` is required after trimming and has a 500-character maximum.
- Topic fields use the same limits as the preview action.

Return value:

```ts
{
  questionId: Id<"questions">;
  scheduledQuestionId: Id<"scheduledQuestions">;
  teamTopicId?: Id<"teamTopics">;
}
```

If the day already has an assignment, the new exact question replaces it.

### `core.teamPrompts.listTeamTopics`

Lists up to 200 topics for an organization, most recently updated first. Any
organization member can read the list.

Arguments:

```ts
{
  organizationId: Id<"organizations">;
}
```

Return item:

```ts
{
  _id: Id<"teamTopics">;
  name: string;
  guidance: string;
  boundaries?: string;
  updatedAt: number;
}
```

### `core.schedules.getSchedule`

Assignment results now include topic provenance and normalize custom question
text:

```ts
{
  // existing assignment fields
  teamTopicId?: Id<"teamTopics">;
  teamTopicName?: string;
  question: {
    // `text` resolves questions.text ?? questions.customText
    text?: string;
    // existing question fields
  };
}
```

`core.schedules.getCurrentWeekSchedule` also resolves `customText` so exact team
questions render in manager and coach-compatible schedule readers.

## Data model

### `teamTopics`

| Field            | Type                  | Required |
| ---------------- | --------------------- | -------- |
| `organizationId` | `Id<"organizations">` | Yes      |
| `name`           | `string`              | Yes      |
| `guidance`       | `string`              | Yes      |
| `boundaries`     | `string`              | No       |
| `createdBy`      | `Id<"users">`         | Yes      |
| `createdAt`      | `number`              | Yes      |
| `updatedAt`      | `number`              | Yes      |

Indexes:

- `by_organizationId`
- `by_organizationId_and_updatedAt`

### `scheduledQuestions.teamTopicId`

Optional `Id<"teamTopics">` identifying the topic that produced the exact
assigned question. Assignments created from the public library or direct writing
leave it unset.

Index: `by_teamTopic`.

### Private exact questions

Team Prompt questions use the existing `questions` table with:

```ts
{
  organizationId: Id<"organizations">;
  authorId: string;
  customText: string;
  kind: "team_prompt";
  status: "private";
  totalLikes: 0;
  totalThumbsDown: 0;
  totalShows: 0;
  averageViewDuration: 0;
}
```

`kind: "team_prompt"` gives these questions a schedule-managed lifecycle. They
are excluded from the creator's personal-question library and cannot be edited,
deleted, or made public through the personal-question mutations. Draft schedule
changes must go through the Team Prompt scheduler instead.

## Permission matrix

| Operation                               | Admin | Manager | Member |
| --------------------------------------- | ----- | ------- | ------ |
| Generate topic previews                 | Yes   | Yes     | No     |
| Create and assign exact questions       | Yes   | Yes     | No     |
| Create a topic by accepting a candidate | Yes   | Yes     | No     |
| List team topics                        | Yes   | Yes     | Yes    |
| Read published daily question           | Yes   | Yes     | Yes    |

Creation and generation also require an organization with `planTier: "team"`
and a billing status of `active` or `trialing`.

Draft Team Prompt assignments are visible only to admins and managers. Ordinary
members receive Team Prompt wording through published schedule readers. Shared
question-by-ID readers enforce the same boundary. Schedule assignment also
rejects private or organization-owned questions from another workspace.

## Related documentation

- [How to schedule a Team Prompt](how-to-schedule-team-prompts.md)
- [Team Prompts product and engineering spec](product-spec.md)
