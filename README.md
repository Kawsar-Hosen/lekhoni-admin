# Lekhoni Admin

Independent admin panel for Lekhoni Kahini. This project does not modify `xyteee.com` or its existing `/admin` route.

## Local development

```bash
npm install
npm run dev
```

## Cloudflare deployment

1. Push this directory to a new GitHub repository.
2. Create a Cloudflare Pages project from the repository. Build command: `npm run build`; output: `dist`.
3. Add custom domain `admin.xyteee.com` to the Pages project.
4. Create R2 bucket `lekhoni-media` and expose it through a dedicated media domain.
5. Create a Neon PostgreSQL project and run `db/schema.sql`.
6. Set Worker secrets: `wrangler secret put DATABASE_URL` and `wrangler secret put MEDIA_PUBLIC_URL`.
7. Protect `admin.xyteee.com` with Cloudflare Access before production use.

## Moderator access

- **Admin:** `https://admin.xyteee.com` — Cloudflare Access + `ADMIN_SECRET`.
- **Moderators:** `https://lekhoni-admin.pages.dev` — simple username/password; this host opens on the Moderator tab by default.
- Admin creates/disables/resets/deletes moderator accounts from the **Moderators** page.
- Moderators can publish/unpublish stories, approve/reject writer stories, assign writer badges, delete stories, and send reader/writer notifications. Other admin pages and APIs are blocked server-side.

Cloudflare Access protects only the custom domain. The `*.pages.dev` URL is public, so anyone can reach the login page there. If moderators must also pass Cloudflare Access, add a bypass policy for their path or disable Access for that host in the Zero Trust dashboard.

Never expose `DATABASE_URL` or R2 credentials in the Vite frontend.
