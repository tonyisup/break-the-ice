# Current Priority Tasks

## Visual Like History/Favorites
- Add a visual representation of the like history
  - Mini stack of cards visualization for intuitive display
  - Notification-style count indicator (circle with number)
  - Quick access to view total liked items
  - Consider hover/preview functionality

## Storage Implementation
- Store the like history
  - MVP: Browser Storage (localStorage/IndexedDB)
    - Pros: Simple implementation, offline support
    - Cons: Device-specific, limited space, clearable
  - Future Database Consideration:
    - Only if needed for: cross-device sync, analytics, or user accounts
    - Could enable additional features beyond just likes

## AI Integration
- Integrate an AI API for question generation
  - Use liked history to generate personalized questions
  - Need to structure AI prompts based on like patterns
  - Consider implementing after core features are stable
  - Could use likes data to improve AI response quality

# Future Enhancements

## Content Organization
- Question categories
  - Implement before NSFW features
  - Improves content navigation and scalability
  - Could influence AI question generation

## Like History Management
- CRUD operations for saved items
- AI generate directly from history
- Custom folders / categories
  - Personal collections
  - Topic-based organization
  - Sharing capabilities?

## UI/UX Improvements
- Icons for main buttons
- Icons for categories
- Custom icons for favorites
  - Visual recognition enhancement
  - Consider consistent style guide
  - Accessibility considerations

## Content Filtering
- NSFW toggle
  - Requires careful consideration:
    - Content moderation strategy
    - Age verification implementation
    - AI model compatibility (most are PG-only)
    - Separate AI models might be needed

# Implementation Recommendations
1. Start with browser storage MVP
2. Implement visual history feature first
3. Add basic categorization
4. Integrate AI features
5. Consider advanced features (NSFW, user accounts) based on usage data

# Completed
- Project Setup & Core Infrastructure
  - Next.js 15 setup with TypeScript
  - tRPC API configuration
  - Prisma database integration
  - Tailwind CSS styling
  - Dark/Light mode toggle
  - PostHog analytics integration

- Core Features
  - Basic card stack interface
    - Swipe left/right functionality
    - Drag and drop support
    - Smooth animations using Framer Motion
  - Question system
    - Random question generation
    - Stack-based question display
    - Basic API endpoints for questions
  - UI Components
    - Card component with animations
    - Button components
    - Dropdown menu
    - Dark mode toggle