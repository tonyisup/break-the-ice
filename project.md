# Break the Ice

## Goal
Help fitness studios and group training coaches build community through curated ice-breaker questions — with minimal effort.

## Background
In many fitness group training classes, the coach starts with a "Question of the Day" to welcome new participants and mentally wake up the room. Coaches don't have time to invent these on the fly, and studio owners want consistent, brand-aligned prompts across locations.

**The insight:** This started as a consumer swiping app but is pivoting to B2B. Fitness studios are the primary customers — coaches get one daily question; studio admins use AI-powered curation to set the week's lineup. The consumer-facing scroll interface becomes a marketing funnel into the B2B product.

## Architecture

### Tier 1: Consumer (Marketing Funnel)
- Public-facing app at breaktheiceberg.com
- Infinite scroll through AI-generated ice-breaker questions
- Like/favorite questions, swipe/swipe-away UX
- Gated by sign-in (Clerk)
- Natural on-ramp to "Want this for your studio?" CTA

### Tier 2: B2B — Organization Admin Portal
- Studio/gym admins curate weekly question sets using AI suggestions
- Select from AI-generated recommendations filtered by style, tone, topic
- Set 5–7 questions for the week's schedule
- View aggregated coach feedback from the prior week to inform next week's curation
- Manage team members (coaches/operators) and their preferences

### Tier 3: B2B — Coach/Operator Daily Viewer
- Coaches see exactly one question of the day — the one their admin assigned
- No endless scroll, no choice paralysis
- Advanced feedback: rate quality, note relevance, flag tone mismatch, suggest adjustments
- Feedback feeds the weekly algorithm to refine next week's suggestions
- Simple, quick — coaches are busy before class starts

## Current State

### Completed
- ✅ Infinite scroll interface for consumer browsing (replaced original swipe cards)
- ✅ Like/favorite system with persistence
- ✅ AI question generation with category/tag/style/tone control
- ✅ Organization multi-tenancy (orgs, members, roles: admin/manager/member)
- ✅ Admin dashboard (questions, styles/tones/topics, pool, pruning, duplicates)
- ✅ Question collections system
- ✅ Billing integration via Clerk (org-level)
- ✅ Embedding-based similarity/duplicate detection (384-dim vectors)
- ✅ Nightly generation pool system for batch AI generation
- ✅ Configurable pruning pipeline with settings
- ✅ Analytics with view duration tracking
- ✅ PostHog integration
- ✅ Newsletter (Resend) + subscription management
- ✅ Dark/light mode, responsive design

### In Progress / Near-Term
- 🔄 Weekly curation UI: admin sets 5–7 questions for the coming week
- 🔄 Coach daily viewer: single-assigned question with advanced feedback
- 🔄 Refine feedback types beyond like/thumbs-down (relevance, tone match, suggestion)
- 🔄 Feedback pipeline: aggregate coach feedback → weekly tuning signal for AI suggestions
- 🔄 Consumer side as marketing funnel → B2B conversion CTAs

### Lower Priority
- ⏸ Instagram daily post automation (blocked on Facebook API setup)
- ⏸ URL slugs for questions
- ⏸ Admin portal separation (currently co-located with consumer app)
- ⏸ Feature flags to gate beta features (More Like This, Style/Tone drawers)

## Design Guides
- Consumer: infinite scroll, smooth animations, dark/light mode
- Coach viewer: minimal, one question, fast feedback, no distractions
- Admin curation: dense, efficient, side-by-side AI suggestions with batch select
- Responsive across all tiers
