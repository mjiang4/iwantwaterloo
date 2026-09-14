# Submission experience — development preview

Approved September 14, 2026. Develop and test separately; do not publish these changes to iwantwaterloo.com without a new production request.

## Experience

- One writing area with the persistent prompt “Share a change and why it matters.”
- One optional public signature, entered as a single string: “Alex, 19, CS student” or “Jamie, 37, lifelong resident”. No age parsing, profile requirement, or demographic ranking.
- The existing `display_name` column stores the signature (60 characters). Existing attribution remains compatible; no new schema or database is needed.
- Explicit “Remember on this device” stores a local autofill preference. Published signatures are stored on each idea; clearing the preference never changes old ideas. Draft recovery remains session-local.
- Place and connection expand inline. Five optional topic chips replace the composer tag popup; existing custom draft tags remain removable, and the browsing filter retains tag search. “Post idea” publishes; “Share idea” opens the device share sheet or copies an individual link.
- The tree reveal has an immediately available receipt with the actual idea, signature, Share and Done. Anonymous ideas have no signature or anonymous badge.
- “Yours” filters both list and garden using the visitor cookie on the server. It means this browser, not verified identity or cross-device ownership. No editing/recovery permissions are added.
- `/ideas/:id` provides server-rendered text, signature, idea-specific metadata, likes and discussion without loading the 3D garden. Old `/?idea=:id` links remain supported. Public links contain no ownership credential.
- Reply signatures can reuse the explicit saved device preference and remain editable. Unsigned replies have no author badge.

## Validation

Local compiled production preview with its own D1 state. Chromium checks cover draft recovery, exact signatures, remember/forget, signed and anonymous submission, post receipt, browser-specific Yours filtering, native-share payload, cancelled sharing, clipboard fallback, idea-specific server metadata and like persistence. WebKit checks cover mobile layout, narrow screens, failed-save recovery, inline context and share-page content without JavaScript.

Screenshots are test artifacts only. Test records are removed by their exact IDs from local preview state; existing local and remote ideas are preserved. Physical phone testing and observed participation improvements remain separate from these functional checks.

## Deferred

Secure editing/recovery, cross-device accounts and demographic research are not included. The separate optional “Why this matters” input remains an alternative for a future usability comparison, rather than another required field.
