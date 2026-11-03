# MV Master rebrand (2026-11-03)

- Product name: **MV Master** (title, metadata, header, README, CLI help banner). Repo/package/CLI binary unchanged.
- `/` renders the MV production page (`app/mv/page.tsx`); `/mv` still works.
- Short-drama canvas moved to `app/drama/DramaCanvas.tsx`, served at `/drama` only when `NEXT_PUBLIC_FEATURE_SHORT_DRAMA=1`; otherwise redirects to `/`.
- Nav comes from `lib/features.mjs#navItems`; with the flag off only “MV 制作” shows. Voice/redub routes still exist but are not linked.
- Subtitle module (CLI `subtitle`) stays as MV post-production (双语字幕).
- Next: UI template dropdown from `listMvPromptTemplates()`, MV-focused subtitle step in the UI.
