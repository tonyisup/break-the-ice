# Ice Breaker: AI-Powered Conversation Starters

**Ice Breaker** is a fun and interactive application designed to spark engaging conversations in any social setting. Whether you're in a team meeting, a workshop, or a friendly get-together, this app provides an endless stream of unique ice-breaker questions to get everyone talking.

Powered by a modern tech stack, Ice Breaker features a sleek, intuitive interface and AI-driven question generation to ensure you never run out of interesting topics.

## ✨ Features

*   **Instant Question Display**: Get a unique ice-breaker question the moment you open the app.
*   **Swipe Interface**: Effortlessly swipe through questions to find the perfect one.
*   **Favorites**: Like a question? Save it to your "Liked" list for easy access later.
*   **AI-Powered Generation**: Generate custom questions tailored to your interests using AI. Select from various categories, styles, and tones to guide the generation process.
*   **Sleek, Modern UI**: Enjoy a beautiful, responsive interface with both **Dark and Light modes**, smooth animations, and full gesture support.
*   **Admin Dashboard**: A built-in dashboard allows administrators to manage questions, categories, styles, and tones, giving you full control over the app's content.

## 🤖 AI-Powered Question Generation

The AI question generation feature uses OpenAI's GPT-4 to create unique and contextually relevant questions. You can guide the AI by selecting from a variety of predefined categories, styles, and tones to generate questions that fit any occasion.

For a more detailed explanation of how this feature is implemented, check out the [AI Feature Guide](./AI_FEATURE_GUIDE.md).

## 🚀 Getting Started

Follow these steps to get the Ice Breaker application running on your local machine.

### Prerequisites

*   [Node.js](https://nodejs.org/) (v18 or later)
*   [npm](https://www.npmjs.com/)

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/your-repo/ice-breaker.git
cd ice-breaker
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

### 3. Running the Application

Once your environment variables are set, you can start the application with the following command:

```bash
npm run dev
```

This command will:
1.  Run a one-time setup script (`setup.mjs`) to help configure Convex auth.
2.  Start the Vite development server for the frontend.
3.  Start the Convex development server for the backend.

The application will open in your default browser.

## 🛠️ Tech Stack

*   **Frontend**: [React](https://react.dev/), [Vite](https://vitejs.dev/), [TypeScript](https://www.typescriptlang.org/)
*   **Backend & Database**: [Convex](https://convex.dev/)
*   **Authentication**: [Clerk](https://clerk.com/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/)
*   **Animation**: [Framer Motion](https://www.framer.com/motion/)
*   **Testing**: [Vitest](https://vitest.dev/)
