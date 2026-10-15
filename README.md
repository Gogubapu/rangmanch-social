# RangManch

RangManch is a social app for sharing Indian culture, community stories, photos, short videos, and conversations.

## Run locally

Requirements: Node.js 18 or newer.

```powershell
npm run dev
```

Open <http://localhost:3000>. To use another port:

```powershell
$env:PORT = '3001'
npm run dev
```

## Deploy to Vercel

Import `Gogubapu/rangmanch-social` from the Vercel dashboard and deploy from the `main` branch. This is a static HTML app, so select **Other** as the framework preset, leave the Build Command and Output Directory empty, and deploy from the repository root. `vercel.json` enables clean URLs, so pages such as `/login` and `/signup` resolve to their HTML files.

The app connects directly to Supabase from the browser. In Supabase Auth URL Configuration, set the Vercel deployment URL as the Site URL and add it (including `/reset-password`) to the allowed redirect URLs. Keep Row Level Security enabled for database tables and storage. The Supabase anon/publishable key is intended for browser use; never expose a service-role key.

## Supabase setup

The browser app uses Supabase Auth, Database, and Storage. Configure the project URL and public anon key in `supabase-config.js`. Never put a Supabase service-role key in browser code.

Apply the SQL files in `supabase/migrations` to the same Supabase project, in filename order. The migrations create social profiles and content, follows and private follow requests, notifications, direct messages, story audio, comment management, and profile counters.

In Supabase Auth URL Configuration, add your local and production URLs to the allowed redirect URLs. Password recovery uses `/reset-password.html`; for local development, add `http://localhost:3000/reset-password.html` (or the port you use).

## Features

- Email sign-up, login, password recovery, and optional authenticator-app MFA.
- Profiles with privacy settings, posts, likes, comments, and follow controls.
- Private-account follow requests with accept/decline notifications.
- Stories that expire after 24 hours, with optional soundtrack and previous/next navigation.
- Explore and Reels views, plus direct messages and activity notifications.
- Terms, Privacy, and Community Guidelines pages.

Story and post media currently use the public `indianfeed-media` storage bucket. Hiding content in the app does not revoke access to an already shared direct media URL.
