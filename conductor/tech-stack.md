# Technology Stack

This document outlines the technology stack used in the "Ice Breaker" project.

*   **Frontend**: The user interface is built with [React](https://react.dev/) and [Vite](https://vitejs.dev/), written in [TypeScript](https://www.typescriptlang.org/).

*   **Backend & Database**: We use [Convex](https://convex.dev/) for our backend logic and real-time database.

*   **Authentication**: User authentication is handled by [Clerk](https://clerk.com/).

*   **Styling**: The application is styled using [Tailwind CSS](https://tailwindcss.com/).

*   **Animation**: UI animations are implemented with [Framer Motion](https://www.framer.com/motion/).

*   **Testing**: Unit and integration tests are written and executed with [Vitest](https://vitest.dev/).

*   **AI**: AI-powered question generation runs through [OpenRouter](https://openrouter.ai/) with a model named in code (`GENERATION_MODEL` in `convex/lib/generationRunner.ts`, Claude Opus 5.5), under a daily spend cap. An optional quality check of each generated question (`QUALITY_CHECK_MODE` in the Convex environment, off by default) calls the same provider, with its model named in `convex/lib/qualityCheck.ts` (`QUALITY_CHECK_MODEL`).
