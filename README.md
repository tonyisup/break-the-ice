# Break the Ice

[breaktheiceberg.com](https://www.breaktheiceberg.com/)

Break the Ice helps facilitators find conversation starters for classes, team meetings,
workshops, and social gatherings. Browse a scrolling feed, filter by style, tone, or topic,
and save questions to use again. Team workspaces add shared collections and scheduled prompts.

The admin tools support question editing, generation, pruning review, and duplicate review.
AI generation is implemented in the [generation runner](./convex/lib/generationRunner.ts)
and [prompt architecture](./convex/lib/promptArchitecture.ts).

## Documentation

- [Team Prompts product and engineering spec](./docs/team-prompts/product-spec.md)
- [How to schedule a Team Prompt](./docs/team-prompts/how-to-schedule-team-prompts.md)
- [Team Prompts reference](./docs/team-prompts/reference.md)

## Development

Follow these steps to get the Ice Breaker application running on your local machine.

### Prerequisites

*   [Node.js](https://nodejs.org/) (22 or later)
*   [npm](https://www.npmjs.com/)

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/tonyisup/break-the-ice.git
cd break-the-ice
npm install
```

### 2. Environment Variables

This project requires both frontend and backend environment variables to be configured.

#### Frontend Variables (`.env.local`)

Create a file named `.env.local` in the root of the project and add the following variables:

```
VITE_CONVEX_URL="your-convex-url"
VITE_CLERK_PUBLISHABLE_KEY="your-clerk-publishable-key"
```

*   `VITE_CONVEX_URL`: You can find this in your [Convex Dashboard](https://dashboard.convex.dev) under **Settings**.
*   `VITE_CLERK_PUBLISHABLE_KEY`: You can find this in your [Clerk Dashboard](https://dashboard.clerk.com) under **API Keys**.

#### Backend Variables (Convex Dashboard)

The following variables need to be set in your [Convex Dashboard](https://dashboard.convex.dev) under **Settings** → **Environment Variables**:

*   `CLERK_JWT_ISSUER_DOMAIN`: You can find this in your [Clerk Dashboard](https://dashboard.clerk.com) under **API Keys**. It should be the "JWT Issuer URL".
*   `OPENAI_API_KEY`: Your API key from the [OpenAI Platform](https://platform.openai.com/api-keys).
*   `RESEND_API_KEY` or `RESEND_API_TOKEN`: A Resend API key with email-sending permission, required for newsletter verification and delivery.

### 3. Running the Application

Once your environment variables are set, you can start the application with the following command:

```bash
npm run dev
```

This starts Vite on port 5170 and `convex dev` in parallel. Convex watches and
synchronizes backend code with the configured development deployment. Configure Clerk
and Convex before starting; the command does not run `setup.mjs`.

Use `npm run dev:frontend` to preview frontend changes against the existing backend
without synchronizing it.

### Validation

- `npm run typecheck` checks the frontend, backend, API routes, and Vite configuration.
- `npm run lint` runs ESLint across `src`, `convex`, and `api`.
- `npm run test:run` runs the test suite once.
- `npm run build` builds the frontend.
- `npm run check` runs all four checks and stops on the first failure.

These checks do not synchronize or deploy backend code. ESLint currently exposes existing
violations, including async event handlers and redundant type assertions; a failed lint
run is a real failure to address, not a successful validation.

AI allowances come from the Convex environment: `MAX_FREE_AIGEN` (default 10) and
`MAX_TEAM_AIGEN` (default 100; falls back to legacy `MAX_CASUAL_AIGEN`). Usage is counted
per person within each workspace over 30-day cycles. The public pricing summary reads
those allowances from Convex and plan prices directly from Clerk.

## Stack

*   **Frontend**: [React](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
*   **Backend & Database**: [Convex](https://convex.dev/)
*   **Authentication**: [Clerk](https://clerk.com/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Animation**: [Framer Motion](https://www.framer.com/motion/)
*   **Testing**: [Vitest](https://vitest.dev/)
