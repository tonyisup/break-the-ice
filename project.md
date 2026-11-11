# Break the Ice

## Goal
Help fitness studios and group training coaches build community through curated ice-breaker questions — with minimal effort.

## Background
In many fitness group training classes, the coach starts with a "Question of the Day" to welcome new participants and mentally wake up the room. Coaches don't have time to invent these on the fly, and studio owners want consistent, brand-aligned prompts across locations.

**The insight:** This started as a consumer swiping app but is pivoting to B2B. Fitness studios are the primary customers — coaches get one daily question; studio admins use AI-powered curation to set the week's lineup. The consumer-facing scroll interface becomes a marketing funnel into the B2B product.

## Architecture

### Consumer app
- Public-facing app at breaktheiceberg.com
- Infinite scroll through AI-generated ice-breaker questions
- Like/favorite questions, swipe/swipe-away UX
- Gated by sign-in (Clerk)

### Removed: team workspaces
The studio tiers built here (an organization admin portal for weekly curation and a coach's
daily viewer, with collections and a Team plan) were removed in November 2026. The code is at
the `pre-teams-removal` tag.

## Current State

### Completed
- ✅ Infinite scroll interface for consumer browsing (replaced original swipe cards)
- ✅ Like/favorite system with persistence
- ✅ AI question generation with category/tag/style/tone control
- ✅ Admin dashboard (questions, styles/tones/topics, pool, pruning, duplicates)
- ✅ Billing plumbing via Clerk (per person; nothing is sold yet)
- ✅ Embedding-based similarity/duplicate detection (384-dim vectors)
- ✅ Nightly generation pool system for batch AI generation
- ✅ Daily AI spend cap, per-call cost tracking, and per-person AI rate limits
- ✅ Admin review queue for new AI questions from the feed, daily email and nightly pool, held out of shared lists until approved
- ✅ Optional AI quality check of generated questions (record-only, off by default): verdicts for admins
- ✅ Configurable pruning pipeline with settings
- ✅ Analytics with view duration tracking
- ✅ PostHog integration
- ✅ Newsletter (Resend) + subscription management
- ✅ Dark/light mode, responsive design

### In Progress / Near-Term
- 🔄 Refine feedback types beyond like/thumbs-down (relevance, tone match, suggestion)

### Lower Priority
- ⏸ Instagram daily post automation (blocked on Facebook API setup)
- ⏸ URL slugs for questions
- ⏸ Admin portal separation (currently co-located with consumer app)
- ⏸ Feature flags to gate beta features (More Like This, Style/Tone drawers)

## Design Guides
- Consumer: infinite scroll, smooth animations, dark/light mode
- Admin tools: dense, efficient
- Responsive throughout
