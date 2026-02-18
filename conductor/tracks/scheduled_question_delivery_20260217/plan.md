# Implementation Plan: Scheduled Question Delivery

This plan outlines the steps to implement the "Scheduled Question Delivery" feature, adhering to the project's workflow and TDD principles.

## Phase 1: Backend Scheduling Core

- [x] Task: Set up Convex scheduled functions [71fb0a5]
    - [x] Write tests for Convex scheduled function setup
    - [x] Implement Convex scheduled function boilerplate
- [x] Task: Update Convex schema for scheduled questions [96b4103]
    - [x] Write tests for schema modifications and data access
    - [x] Implement schema changes to store scheduled questions (date, time, questionId, status, userId)
- [x] Task: Implement basic scheduling logic [98312e1]
    - [x] Write tests for scheduling functions (e.g., function to add a scheduled task, function to execute a scheduled task)
    - [x] Implement Convex functions to create, read, update, and delete scheduled questions
    - [x] Implement logic to trigger question delivery at the scheduled time
- [ ] Task: Conductor - User Manual Verification 'Backend Scheduling Core' (Protocol in workflow.md)

## Phase 2: UI for Scheduling

- [ ] Task: Create UI components for date/time selection
    - [ ] Write tests for date/time picker component
    - [ ] Implement a reusable date and time picker component
- [ ] Task: Integrate question selection (existing/new)
    - [ ] Write tests for question selection component
    - [ ] Implement UI for selecting an existing question or initiating new question generation
- [ ] Task: Implement API calls from frontend to Convex for scheduling
    - [ ] Write tests for frontend API integration for scheduling
    - [ ] Implement client-side logic to call Convex functions for scheduling questions
- [ ] Task: Conductor - User Manual Verification 'UI for Scheduling' (Protocol in workflow.md)

## Phase 3: Notification and Management

- [ ] Task: Integrate email notification
    - [ ] Write tests for email notification service (mock external API)
    - [ ] Implement Convex function to send email notifications for delivered questions
- [ ] Task: Implement view/edit/cancel scheduled questions UI
    - [ ] Write tests for scheduled questions list component
    - [ ] Implement UI to display a list of all scheduled questions
    - [ ] Implement functionality to edit and cancel scheduled questions
- [ ] Task: Conductor - User Manual Verification 'Notification and Management' (Protocol in workflow.md)
