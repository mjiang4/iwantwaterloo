# Development preview

Preview is the actual application, compiled from the current working copy with the production build command. No dashboard, embedded visitor view, simulated likes, or alternate garden UI. The former `/admin` address redirects to `/` in preview and is unavailable in production.

## Local

Run `npm run preview` and open http://localhost:3001/. Source changes are compiled automatically; refresh the browser after the terminal reports that the new build is ready. Build failure retains the previous working version. The watcher uses local source, including uncommitted edits; it does not pull GitHub or cloud work automatically.

The isolated D1 database is in `.preview/state`, with credentials in `.env.preview`. Preserve both when moving the repository. All generated paths are resolved from the script's current location. Stop the previous preview process before restarting a moved checkout.

## Remote

Maintainer setup is required first: provision a separate private development Site and keep its own hosting manifest and identity migration in ignored `.preview/remote`. This is not part of fresh-clone contributor setup.

Run `npm run preview:stage` to copy current source into `.preview/remote`. It refuses the public Site identity, excludes credentials and local data, removes deleted source, and preserves the private development Site manifest and its isolated identity migration. Build, commit, push and publish this staged checkout through Sites. Repeat this process for each remote update. A failed build is not deployed.

Remote preview has a distinct Site/Worker, URL, D1 database, runtime secrets and owner-only access policy. It does not call iwantwaterloo.com or read its data. Local watching does not deploy remotely or promote production.

There are no preview scripts, dashboard assets, test polling or embedded previews on the public garden page. Existing authenticated `/api/admin/*` routes are retained solely for developer regression checks and fixture cleanup; they reject non-preview environments and require a matching database identity. No visitor interface imports them. They are not a deployment service or a production moderation system.

## Testing

`node --test tests/garden-visuals.mjs tests/garden-discovery.mjs` checks growth, bounded decoration, mobile targets and motion. `npm run test:preview` exercises private test API authorization and database isolation using a disposable Worker and database; no running preview or empty personal database is required. Use the actual visitor UI for submitting, liking and replying. Never seed or clear the public database for preview work.
