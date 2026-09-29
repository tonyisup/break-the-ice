# Changelog

All notable changes to Break the Ice are recorded here.

## [0.1.0.0] - 2026-09-29

### Fixed
- Private and team questions stay private everywhere. Likes, history, analytics and remix now check who can see a question before linking or returning it, so someone who has another person's private question ID can't like it, pull it into their history, or get it remixed.
- Likes count once. Repeated likes from a signed-in person, or from a signed-out visitor in the same browser, no longer inflate a question's like count, the admin like rate, or its show count.
- Signing in no longer loses what you did while signed out. Your liked, hidden and viewed questions go to your personal workspace first, and they are cleared from the browser only after the server confirms and only if nothing changed meanwhile.
- Merging signed-out history again after a failed or repeated sign-in no longer double-counts views.
- A failed remix refunds the same allowance it used. Remixing a gym's public question uses your own allowance unless you are a member of that gym.
- View durations are capped at 10 minutes, so one bad report can't skew a question's average. History timestamps that can't be real are ignored.
- Your liked list, history and remix find your account by sign-in ID, so they keep working after an email change.

### Changed
- The signed-out session ID is now saved in the browser (with cookie consent), so a signed-out like counts once per browser rather than once per page load. Signed-in activity no longer carries that ID.

### Removed
- Public backend endpoints that could leak questions or spend AI credits without a check: the old AI preview, generate and newsletter endpoints, the similar-question and next-by-embedding queries, the discard endpoint, and the unused random style and tone queries. Nearest-question search, tag setup and Instagram posting now run on the server only.
