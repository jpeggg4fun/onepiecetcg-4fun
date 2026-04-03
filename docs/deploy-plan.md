# Deploy Plan

## Stack

- Frontend: Vite + React
- Backend: Vercel Functions under `app/api`
- Database: Supabase
- Auth: custom `username + senha` with hashed passwords and session cookie

## Supabase setup

1. Create a new Supabase project.
2. Open the SQL editor.
3. Run `supabase/schema.sql`.
4. Copy:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

## Environment variables

Configure these in Vercel for the project:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Local example is in `.env.example`.

## Vercel deploy

1. Link the project:

```bash
vercel link
```

2. Add env vars in Vercel dashboard or CLI.
3. Deploy:

```bash
vercel
```

4. For production:

```bash
vercel --prod
```

## Local development

- `npm run dev` runs only the Vite frontend.
- `npm run dev:online` runs the Vercel environment so the `api/` routes work too.

Use `dev:online` whenever you need to test register/login/lobby locally.

## Current MVP scope

- Register with username and password
- Login/logout with cookie session
- Create private room by code
- Join private room by code
- List rooms for the authenticated user

## Next backend milestones

1. Game room details endpoint by id
2. Persisted initial `game_state_snapshots`
3. Turn sync and optimistic UI
4. Presence / polling or realtime subscriptions
