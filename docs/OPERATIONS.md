# Operations

## Environments

The public Site, private development Site, local preview, and disposable test environments are distinct. Inspect the exact Site and database identity before any operator action. Never point test scripts at a public URL. GitHub CI does not publish.

The current local development command is `npm run preview`. It uses the production build but its own local data. Remote preview provisioning and staging are documented in [PREVIEW-ADMIN.md](PREVIEW-ADMIN.md).

## Reports

Reports are stored in the D1 `reports` table. Until a protected moderation interface exists, a maintainer must inspect them through the hosting provider's authenticated database tools. No public or preview endpoint is a production administration API.

For a read-only queue, use the selected environment's SQL console:

```sql
SELECT r.id, r.created_at, r.reason, r.idea_id, r.comment_id,
       i.description AS idea, c.body AS reply
FROM reports r
LEFT JOIN comments c ON c.id = r.comment_id
LEFT JOIN ideas i ON i.id = COALESCE(r.idea_id, c.idea_id)
ORDER BY r.created_at DESC;
```

Review the reported contribution in context; a report alone is not evidence of misconduct. Keep case notes private. Do not export browser IDs into public issues.

For a confirmed abusive reply, the operator can change that specific comment's `moderation_state` to `hidden` using a parameterized query in authorized tooling. The public API excludes hidden replies. Idea hiding, resolution status, and a review interface remain planned; do not repurpose preview scenario/reset tools to moderate production.

## Releases and recovery

Run the checks and browser tests before a release. Inspect migration SQL separately. Record the deployed source commit and verify the saved version's deployment status. A code rollback does not undo database migrations.

Preserve a backup/recovery point before approved data migrations. Current tree positions rely on legacy rowids, so a casual export/delete/reinsert cycle can move trees. No deployment or data migration is part of the September 18 refactor itself.
