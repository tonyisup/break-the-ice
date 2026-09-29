# Changelog

All notable changes to Break the Ice are recorded here.

## [0.2.0.0] - 2026-09-29

### Added
- A daily spending cap on AI. The daily budget ($1 by default) is one shared pool for all signed-in users, not an allowance per person: once their combined spend on generation they can start (new feed questions, remix, matrix fill, team topic previews) reaches it, that generation pauses for everyone for the rest of the day. The daily email and admin tools keep working up to a separate hard cap ($5 by default). Both are Convex environment variables (`AI_DAILY_BUDGET_USD`, `AI_DAILY_HARD_CAP_USD`) you can change without a deploy.
- Every tracked generation call (feed questions, remix, matrix fill, team and admin previews, the daily email) records what it actually cost, which model answered, and its token counts, on its generation run. Embedding calls and the admin image generator are not tracked or counted toward the cap.
- Limits on how fast one person can ask for AI: a burst of 10, then about one every two minutes, and at most 40 a day. Matrix fill is limited per team: one full grid at once, then 100 cells a day.

### Changed
- When AI is paused or you've hit a limit, the feed keeps showing saved questions and tells you why instead of offering an upgrade. Remix and the schedule page show the same plain message.
- Questions over 1,000 characters can't be remixed, and every AI request is capped in size and in how long an answer it can ask for.
- An AI answer that was already paid for but couldn't be used now counts toward your monthly AI allowance, unless the app's own length limit cut it off.

### Fixed
- Matrix fill stops and says why when the budget is paused or the team's limit is reached, instead of quietly skipping every cell.
- Matrix fill and topic preview errors on the schedule page are readable instead of raw error codes.

## [0.1.0.0] - 2026-09-29

### Fixed
- Private and team questions stay private everywhere. Likes, history, analytics and remix now check who can see a question before linking or returning it, so someone who has another person's private question ID can't like it, pull it into their history, or get it remixed.
- Likes count once. Repeated likes from a signed-in person, or from a signed-out visitor in the same browser, no longer inflate a question's like count, the admin like rate, or its show count. Signed-out likes on a question are also capped per hour, so switching browsers or sessions can't raise them without limit. One exception remains: after a signed-out like is merged into your account at sign-in, unliking and re-liking that question can count it again.
- Signing in no longer loses what you did while signed out. Your liked, hidden and viewed questions go to your personal workspace first, and they are cleared from the browser only after the server confirms and only if nothing changed meanwhile.
- Merging signed-out history again after a failed or repeated sign-in no longer double-counts views.
- A failed remix refunds the same allowance it used. Remixing a gym's public question uses your own allowance unless you are a member of that gym.
- View durations are capped at 10 minutes, so one bad report can't skew a question's average. History timestamps that can't be real are ignored.
- Your liked list, history and remix find your account by sign-in ID, so they keep working after an email change.

### Changed
- The signed-out session ID is now saved in the browser (with cookie consent), so a signed-out like counts once per browser rather than once per page load. Signed-in activity no longer carries that ID.

### Removed
- Public backend endpoints that could leak questions or spend AI credits without a check: the old AI preview, generate and newsletter endpoints, the similar-question and next-by-embedding queries, the discard endpoint, and the unused random style and tone queries. Nearest-question search, tag setup and Instagram posting now run on the server only.
