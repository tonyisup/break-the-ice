# Ice Breaker App Implementation
  
This is a project built with [Chef](https://chef.convex.dev) using [Convex](https://convex.dev) as its backend.
  
This project is connected to the Convex deployment named [`brazen-sturgeon-967`](https://dashboard.convex.dev/d/brazen-sturgeon-967).
  
## Features

### Core Features
- **Question Display**: Instantly see unique ice-breaker questions upon landing
- **Swipe Interface**: Swipe away questions to view new ones
- **Favorites**: Mark questions as "liked" and view them later
- **AI Generation**: Generate custom questions using AI with tag-based filtering

### AI Question Generation
- **Tag Selection**: Choose from predefined categories like fitness, work, travel, food, music, movies, books, technology, family, hobbies, dreams, childhood, learning, adventure, and creativity
- **Smart Prompts**: AI generates contextually relevant questions based on selected tags
- **Seamless Integration**: Generated questions are automatically added to your question queue

## Project structure
  
The frontend code is in the `src` directory and is built with [Vite](https://vitejs.dev/).
  
The backend code is in the `convex` directory.
  
`npm run dev` will start the frontend and backend servers.

## Environment Setup

### OpenAI API Key
To use the AI question generation feature, you need to set up an OpenAI API key:

1. Get your API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a `.env.local` file in the project root
3. Add your API key: `OPENAI_API_KEY=your_actual_api_key_here`

### App authentication

Chef apps use [Convex Auth](https://auth.convex.dev/) with Anonymous auth for easy sign in. You may wish to change this before deploying your app.

## Developing and deploying your app

Check out the [Convex docs](https://docs.convex.dev/) for more information on how to develop with Convex.
* If you're new to Convex, the [Overview](https://docs.convex.dev/understanding/) is a good place to start
* Check out the [Hosting and Deployment](https://docs.convex.dev/production/) docs for how to deploy your app
* Read the [Best Practices](https://docs.convex.dev/understanding/best-practices/) guide for tips on how to improve you app further

## HTTP API

User-defined http routes are defined in the `convex/router.ts` file. We split these routes into a separate file from `convex/http.ts` to allow us to prevent the LLM from modifying the authentication routes.
