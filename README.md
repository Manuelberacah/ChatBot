# Tars Realtime Chat App

Full-stack realtime chat application built for the **Tars Full Stack Engineer Internship Coding Challenge 2026**.

## Project Overview

This app enables authenticated users to discover other users and exchange real-time messages.

Core goals:
- Secure authentication
- Realtime one-to-one messaging
- Responsive chat experience
- Clean, reviewable git history via incremental PRs

## Tech Stack

- **Frontend**: Next.js (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Clerk
- **Backend + Database + Realtime**: Convex
- **Deployment**: Vercel

## Required Features (Challenge Scope)

1. Authentication (Clerk)
2. User list + search
3. One-on-one direct messages (realtime)
4. Message timestamps (smart formatting)
5. Empty states
6. Responsive layout (desktop + mobile)
7. Online/offline status
8. Typing indicator
9. Unread message count
10. Smart auto-scroll

Optional:
- Delete own messages (soft delete)
- Message reactions
- Loading and error states
- Group chat

## Current Status

- [x] Project bootstrap (Next.js + TypeScript + Tailwind)
- [x] Clerk setup (middleware + sign-in/sign-up routes)
- [x] Convex client provider wiring
- [x] Protected app shell route
- [x] Convex users schema and auth config
- [x] Clerk-to-Convex user profile sync on app load
- [x] Header with logged-in user name + avatar/logout menu
- [x] User discovery list (excluding self) + live search
- [x] Create/open one-to-one conversation on user click
- [x] Realtime message send/list for one-to-one chats
- [x] Conversation sidebar with latest message preview
- [x] Challenge-compliant timestamp formatting (today vs older vs older year)
- [x] Explicit empty states for search, conversations, and messages
- [x] Responsive layout: desktop split view + mobile full-screen chat with back button
- [x] Real-time online/offline presence indicators
- [ ] Remaining messaging features (in upcoming PRs)

## Local Setup

## 1) Install dependencies

```bash
npm install
```

## 2) Configure environment variables

Create `.env.local` (or copy from `.env.example`) and set:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/app
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/app
CLERK_JWT_ISSUER_DOMAIN=
NEXT_PUBLIC_CONVEX_URL=
```

## 3) Run development server

```bash
npm run dev
```

App URL: `http://localhost:3000`

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run ESLint

## Folder Highlights

- `src/app` - Next.js app router pages/layouts
- `src/middleware.ts` - Clerk auth protection
- `src/components/providers/convex-client-provider.tsx` - Convex + Clerk provider
- `src/components/app/user-sync.tsx` - Sync signed-in Clerk user to Convex
- `src/components/app/chat-workspace.tsx` - User discovery + conversations sidebar + realtime chat thread
- `src/components/app/presence-heartbeat.tsx` - periodic presence updates while app is open
- `convex/schema.ts` - Convex data model
- `convex/users.ts` - user profile mutations/queries
- `convex/conversations.ts` - conversation bootstrap + preview queries
- `convex/messages.ts` - send/list realtime direct messages

## Deployment

Deploy to Vercel and configure all environment variables in the Vercel project settings.

## Submission Checklist

- Public GitHub repository
- Working Vercel deployment
- 5-minute Loom walkthrough video
- Email submission with required links/details

## AI-Assisted Development

This project may use AI-assisted coding tools as allowed by the assignment. All committed code is expected to be fully understood and explainable during review/interview.
