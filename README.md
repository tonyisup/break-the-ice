# Break the Ice

[breaktheiceberg.com](https://breaktheiceberg.com)

Conversation starters for classes, meetings, workshops, and dinner tables. Browse questions, save favorites, and filter by style, tone, or topic. Signed-in users can add questions and generate variations; teams can share collections and schedule prompts.

The app uses React, Vite, TypeScript, Convex, and Clerk. Question generation runs through an OpenRouter preset. The implementation is split between the [generation runner](./convex/lib/generationRunner.ts) and [prompt architecture](./convex/lib/promptArchitecture.ts).

## Documentation

- [Team Prompts product and engineering spec](./docs/team-prompts/product-spec.md)
- [How to schedule a Team Prompt](./docs/team-prompts/how-to-schedule-team-prompts.md)
- [Team Prompts reference](./docs/team-prompts/reference.md)

## Getting started

Follow these steps to get the Ice Breaker application running on your local machine.

### Prerequisites

*   [Node.js](https://nodejs.org/) (v22 or later)
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
*   `OPEN_ROUTER_API_KEY`: Your OpenRouter API key. Configure the `break-the-ice-berg-default` preset in OpenRouter before generating questions.
*   `RESEND_API_KEY` or `RESEND_API_TOKEN`: A Resend API key with email-sending permission, required for newsletter verification and delivery.

### 3. Running the Application

Once your environment variables are set, you can start the application with the following command:

```bash
npm run dev
```

This command will:
1. Start Vite on port 5170.
2. Start Convex in development mode, which synchronizes backend functions with the configured development deployment.

The application will open in your default browser.

## Checks

```bash
npm run lint       # ESLint and all TypeScript projects; no backend synchronization
npm test -- --run  # Unit and integration tests
npm run build     # Production frontend build
npm run check     # All three
```

Use `npm run dev:backend` when you intend to synchronize backend changes with your development deployment. The local Vite server uses the deployment in `VITE_CONVEX_URL`.

## Tech stack

*   **Frontend**: [React](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
*   **Backend & Database**: [Convex](https://convex.dev/)
*   **Authentication**: [Clerk](https://clerk.com/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Animation**: [Framer Motion](https://www.framer.com/motion/)
*   **Testing**: [Vitest](https://vitest.dev/)
