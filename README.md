# CODM Map Veto

Pick/ban rooms for Call of Duty: Mobile series, built with React and [shadcn/ui](https://ui.shadcn.com/).

How a room works:

1. **Create.** A captain (or a host who isn't playing) sets the teams and format, switches off any 2026 maps they don't want, and picks which team they're captaining. They get a 6-character code.
2. **Join.** The other captain enters the code on the home page, types their name and takes the open team.
3. **Wait.** Both captains see a waiting room with only who's in and who's ready. The draft opens for both of them once both tap **I'm ready**. A host can start it early.
4. **Draft.** All bans, then all picks, then starting sides. Every map is either banned or played. At the end, **Copy for Discord** gives a summary.

Anyone else who opens the code once both seats are taken can watch but can't make moves.

## Folder layout

| Path | What it is |
|---|---|
| `src/pages/` | Home, Create, Room (join, waiting room, draft) and Practice |
| `src/components/ui/` | shadcn/ui components (button, card, input, select, switch, badge, progress…) |
| `src/components/draft.jsx` | The draft board |
| `src/lib/veto-engine.js` | Map pools and veto order, shared by the page and the server |
| `api/` | Vercel server functions: create a room, read it, take a seat, ready, make a move |
| `supabase/schema.sql` | The two database tables, run once in Supabase |
| `public/images/maps/` | Your map images |

## Deploying an update from the old version

This version has a build step, so replace the **whole** repository contents, not single files:

1. On GitHub, delete the old files (or create a fresh repository).
2. Upload everything from this folder: `api`, `public`, `src`, `supabase`, `index.html`, `package.json`, `package-lock.json`, `vercel.json`, the config files, and this README. Skip `node_modules` and `dist`.
3. Vercel rebuilds on its own. `vercel.json` tells it to run `npm run build` and serve `dist`, so the Framework Preset can stay on **Other**. If you set **Root Directory** to `codm-veto` before, keep it pointing at the folder that contains `package.json`.

The Supabase setup and the three environment variables (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) don't change.

## First-time deploy

1. **Supabase:** create a project (Singapore is closest), open **SQL Editor**, paste `supabase/schema.sql` and click **Run**. From **Project Settings > API Keys**, copy the Project URL, the publishable (anon) key and the secret (service_role) key.
2. **GitHub:** create a repository and upload this folder's contents so `package.json` is at the top level.
3. **Vercel:** **Add New > Project**, import the repository, and add the three environment variables above before clicking **Deploy**.
4. **Check:** the home page shouldn't show "Rooms aren't connected". Create a room, open the invite link on your phone, and join the other team.

## Map images

Put your images in `public/images/maps/` (create the `images` and `maps` folders inside `public` if they're missing). Each file is named after the map in lowercase, with spaces turned into hyphens. JPG, PNG or WebP all work; a landscape image around 640x360 is plenty.

| Mode | File names |
|---|---|
| Hardpoint | `summit.jpg`, `hacienda.jpg`, `combine.jpg`, `takeoff.jpg`, `arsenal.jpg` |
| Control | `raid.jpg`, `standoff.jpg`, `crossroads-strike.jpg` |
| Search & Destroy | `tunisia.jpg`, `firing-range.jpg`, `coastal.jpg`, `slums.jpg`, `meltdown.jpg` |

`.png` or `.webp` instead of `.jpg` is fine, for example `summit.png`. A map without an image shows as a plain card with its name.

## Working on it locally

```
npm install
npx vercel dev
```

`vercel dev` runs the page and the server functions together. `npm run dev` runs only the page, which is enough for practice drafts.

To add more shadcn components later: `npx shadcn@latest add dialog` (the project already has `components.json`).

## Series order and veto rules

Every format cycles Hardpoint, Control, Search & Destroy:

| Format | Maps |
|---|---|
| Best of 3 | HP, CTRL, S&D (each one is the last map left after bans) |
| Best of 5 | HP, CTRL, S&D, HP, CTRL |
| Best of 7 | HP, CTRL, S&D, HP, CTRL, S&D, HP |
| Grand final | HP, CTRL, S&D, HP, CTRL, S&D, with one team starting 1-0 |

Map picks alternate Team 1, Team 2 down the series. Whichever map isn't picked is a decider (the last map left in that mode). Each mode bans until only the maps that get played are left, so nothing is left over. Bans go Hardpoint first, then Control, then S&D.

To change these, edit `MODES` and `FORMATS` in `src/lib/veto-engine.js`.
