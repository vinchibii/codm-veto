# CODM Map Veto

Pick/ban rooms for Call of Duty: Mobile series, built with React and [shadcn/ui](https://ui.shadcn.com/).

How a room works:

1. **Create.** A captain (or a host who isn't playing) sets the teams, format and map pool, and picks which team they're captaining. They get a 6-character code.
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

Put JPGs in `public/images/maps/` named after the map: `summit.jpg`, `hacienda.jpg`, `combine.jpg`, `takeoff.jpg`, `arsenal.jpg`, `tunisia.jpg`, `firing-range.jpg`, `coastal.jpg`, `slums.jpg`, `meltdown.jpg`, `raid.jpg`, `standoff.jpg`, `crossroads-strike.jpg`. Maps you add in the pool editor use the same rule, for example `nuketown.jpg`. Without an image, the map shows as a plain card.

## Working on it locally

```
npm install
npx vercel dev
```

`vercel dev` runs the page and the server functions together. `npm run dev` runs only the page, which is enough for practice drafts.

To add more shadcn components later: `npx shadcn@latest add dialog` (the project already has `components.json`).

## Changing the default pool or veto order

Edit `MODES` and `FORMATS` in `src/lib/veto-engine.js`. Each mode bans until only the maps that get played are left, so the ban count follows the pool size.
