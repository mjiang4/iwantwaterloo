# Issues and improvements

Current backlog for I Want Waterloo. Add problems here, link related issues or PRs, and record verification before closing an item.

Updated September 18, 2026. Completed changes below are on `codex/contributor-refactor`; they have not been deployed to production.

## Implemented and verified in development

- [x] **IW-001 · Improve text readability.** Raised essential text sizes, consolidated form styles, and kept inputs readable on mobile. Desktop checks include 200% text enlargement without horizontal overflow; Chromium and WebKit mobile checks pass.
- [x] **IW-002 · Make the park the landing view.** The garden opens first, with a clear Share an idea action and access to the idea list. Posting returns visitors to their new tree.
- [x] **IW-003 · Introduce the garden briefly.** A dismissible introduction explains ideas, trees, likes, and replies. Starting an idea dismisses it; How it works in the footer reopens it. Dismissal is remembered on the device.
- [x] **IW-004 · Link to GitHub.** The footer links to [the repository](https://github.com/mjiang4/iwantwaterloo).
- [x] **IW-005 · Invite project contributions.** The footer links to GitHub issues and contribution guidance. [CONTRIBUTING.md](../CONTRIBUTING.md) covers local setup, checks, architecture, and pull requests. Publish the guide with the site release so its GitHub link resolves.

Implementation date: September 18, 2026. See branch `codex/contributor-refactor` and [architecture](ARCHITECTURE.md).

## Implemented experiment, awaiting user feedback

- [ ] **IW-006 · Encourage more thoughtful ideas and replies.** Replies now ask “What would make this idea work better?” Both writing forms offer one short example on request. No new required fields, minimum word count, public quality score, or generated text. Submission and retry behavior pass browser checks; whether the prompts improve contributions still needs a small usability test.

For that test, observe whether people understand the prompt and can add a concrete proposal, experience, or relevant perspective without abandoning the form. Compare with the prior prompt. Assess specificity and relevance alongside completion, not length or likes alone. Short contributions can be excellent.

Only consider adaptive follow-up questions or classification after evaluating this small change. A post-submission follow-up is a later experiment, not a new mandatory step.

## Engineering fixes completed

The [September 18 review](CODE-REVIEW-2026-09-18.md) describes the original checkout. Its six concrete findings are now addressed in development:

- [x] **CR-001:** Reply drafts retain submission keys across retries and survive closing the discussion.
- [x] **CR-002:** Concurrent identical replies return one saved result; conflicting content under one key is rejected.
- [x] **CR-003:** Anonymous browser identity is established and verified before writes, preserving ownership after a lost response.
- [x] **CR-004:** Initial, refresh, and pagination failures have explicit retry states; loaded replies and drafts are retained.
- [x] **CR-005:** API and browser tests own disposable databases, refuse external targets, and cannot use the ordinary preview database.
- [x] **CR-006:** Reports require exactly one existing target.

Shared idea contracts, query construction, filters, likes, detail UI, reply drafts, and SQL mapping now have focused modules. Unused UI scaffolding and dependencies are removed. Contributor instructions, current architecture documentation, operator guidance, and a checks-only CI workflow are included.

Verification: a fresh source checkout installs dependencies and passes type checking, lint, formatting, and all 16 unit/API tests. The compiled application passes desktop and mobile Chromium/WebKit browser checks. Production data and existing preview data were not used as test fixtures.

## Follow-up work

- [ ] **IW-007 · Persist plot positions explicitly.** Replace legacy SQLite rowid placement with an explicit value through a migration that preserves every current tree position. Test an upgrade with existing records before release.
- [ ] **IW-008 · Record the title format explicitly.** Replace the historical generated-title heuristic with a schema field and fixtures for older ideas when the schema next evolves.
- [ ] **IW-009 · Add a protected moderation workflow.** Reports have [operator guidance](OPERATIONS.md); a production queue, resolution status, and idea hiding remain separate work. Do not reuse preview reset controls for production moderation.
- [ ] **IW-010 · Validate on physical phones.** Check text comfort, keyboard behavior, assistive technology, and garden performance on representative devices. Browser emulation and bounded-render tests do not establish physical-device performance.

## Adding an issue

Describe the observed problem, who it affects, and a concrete completion condition. Keep proposed solutions separate from measured results. Record the release separately from implementation: a completed branch is not a production deployment.
