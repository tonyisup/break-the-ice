# Break the Ice

## Goal
A free icebreaker app for everyday social moments (first dates, dinner parties, road trips, family dinners, group chats) that gives people a question worth asking in one tap.

## Background
This started as a consumer swiping app, then pivoted for a while to a B2B product for fitness studios and group-training coaches. In November 2026 team and gym use moved to a separate app, and Break the Ice went back to being a generic consumer icebreaker. Occasion decks (v0.12.0.0) are its main entry point from search and the landing page.

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
- ✅ Occasion decks: /occasions pages and an occasion picker on the feed (v0.12.0.0)
- ✅ Like/favorite system with persistence
- ✅ AI question generation with category/tag/style/tone control
- ✅ Admin dashboard (questions, styles/tones/topics, pool, pruning, duplicates)
- ✅ Billing plumbing via Clerk (per person; nothing is sold yet)
- ✅ Demand test for a paid pack of AI generations: an offer shown where the allowance runs out, recorded per person; nothing is charged
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
