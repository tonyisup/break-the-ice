# AI Question Generation Feature Guide

## Overview
The AI Question Generation feature allows users to create custom ice-breaker questions using OpenAI's GPT-4 model. Users can select specific tags to guide the AI in generating relevant questions.

## How to Use

### 1. Access the AI Generator
- Click the "🤖 AI Generator" button in the top-left corner of the app
- This opens a modal with tag selection options

### 2. Select Tags
Choose from the following categories:
- **Health**: fitness
- **Professional**: work, technology
- **Lifestyle**: travel, food, adventure
- **Entertainment**: music, movies, books
- **Personal**: family, hobbies, dreams, childhood, learning, creativity

### 3. Generate Questions
- Select one or more tags that interest you
- Click "Generate Question" to create a custom AI-generated question
- The generated question will be automatically added to your question queue

## Technical Implementation

### Backend (Convex)
- **File**: `convex/ai.ts`
- **Functions**:
  - `initializeTags()`: Sets up predefined tags in the database
  - `getTags()`: Retrieves all available tags
  - `generateAIQuestion()`: Uses OpenAI API to generate questions
  - `saveAIQuestion()`: Saves generated questions to the database

### Frontend (React)
- **Component**: `src/components/ai-question-generator/ai-question-generator.tsx`
- **Features**:
  - Tag selection interface
  - Loading states during generation
  - Error handling and user feedback
  - Responsive design with dark/light mode support

### Database Schema Updates
- **Questions table**: Added `isAIGenerated`, `tags`, and `promptUsed` fields
- **Tags table**: New table for storing predefined tags with categories

## Environment Setup
1. Get an OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Create a `.env.local` file in the project root
3. Add: `OPENAI_API_KEY=your_actual_api_key_here`

## Error Handling
- Network errors during API calls
- Invalid API key handling
- User feedback for all error states
- Graceful fallbacks

## Future Enhancements
- Similar question suggestions
- Question rating system
- Custom tag creation
- Question history and analytics
