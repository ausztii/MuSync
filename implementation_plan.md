# Graphic Design Club Workflow Manager

This plan outlines the development of a workflow management web application for a graphic design club. Built using **Next.js (App Router)** and **Firebase**, the app features role-based dashboards to coordinate between Leads and Designers, streamlines event creation, manages assignments, and gathers requirements from event leads via public forms.

## Confirmed Design Decisions
- **Authentication**: Supports both Google OAuth and Email/Password login.
- **Requirement Prompting**: Generates a unique public link to a form hosted on the app. Event leads submit details (posters needed, context, etc.) directly into the database.
- **Automated Tracking & Chat**: The app tracks when updates are due and prompts designers with an in-app notification upon login. Designers fulfill this by posting a status update in an event-specific chat/comment thread.
- **UI/Styling**: Tailwind CSS and shadcn/ui component library.

## Proposed Changes

### Setup and Infrastructure
- Initialize Next.js 14 project (App Router, TypeScript, Tailwind CSS).
- Configure Firebase (Auth and Firestore).
- Setup UI components using shadcn/ui.

### Database Schema (Firestore)
- **`users` collection**:
  - Fields: `uid`, `name`, `email`, `role` (enum: 'LEAD', 'DESIGNER'), `status` (enum: 'FREE', 'WORKING').
- **`events` collection**:
  - Fields: `id`, `name`, `date`, `oneLiner`, `status` (enum: 'UNASSIGNED', 'PENDING_CONFIRMATION', 'IN_PROGRESS', 'COMPLETED'), `assignedDesignerId` (optional), `requirements` (object storing submitted form data), `nextUpdateDueAt` (timestamp).
- **`requests` collection** (tracks assignment workflows):
  - Fields: `id`, `eventId`, `designerId`, `type` (enum: 'LEAD_ASSIGNMENT', 'DESIGNER_REQUEST'), `status` (enum: 'PENDING', 'APPROVED', 'DENIED'), `reason` (if denied).
- **`comments` sub-collection** (under each `event`):
  - Fields: `id`, `authorId`, `text`, `createdAt`, `isStatusUpdate` (boolean).

### Application Routes
- `/login`: Firebase authentication page (Google + Email/Password).
- `/dashboard/lead`: Admin dashboard to view all designers' statuses, create events, assign events, and monitor progress.
- `/dashboard/designer`: Designer dashboard to view unassigned events, respond to assignment requests, and view current tasks.
- `/events/[id]`: Event details and chat interface.
- `/events/[id]/requirements-form`: Public-facing form for event conducting leads to submit context.

## Verification Plan
- Verify role-based routing (Leads vs Designers).
- Test the full event lifecycle: creation -> assignment -> confirmation -> requirements gathering -> progress updates -> completion.
