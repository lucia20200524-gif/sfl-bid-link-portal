# Lark registration

The search results use a shared registration action for `sfl`, `engineer`, and
`academy`. The owner retains the existing SFL tables in `lib/lark-registration.ts`. Members use their own copy of the SFL template, linked to their authenticated account. Registration requests cannot override the saved destination, API origin, or field mapping.

## Runtime configuration

Use a dedicated Lark custom app: **SFL 入札リンクポータル連携**. Store its values in
Sites production environment variables, not the repository or browser:

- `LARK_APP_ID`: custom app ID.
- `LARK_APP_SECRET`: app secret, marked as a secret in Sites.
- `LARK_BASE_APP_TOKEN`: optional actual Base token. A wiki node token is not a
  Base token. If omitted, the server resolves the fixed wiki node using Lark's
  `GET /open-apis/wiki/v2/spaces/get_node` API and verifies `obj_type=bitable`.

The dedicated app was created and enabled on 2026-09-11 after the user's
action-time approval. App ID: `cli_aa293e5870f8de18`; released version: `1.0.1`;
organization: LUCIA; availability: the creating SFL user only.

Configured tenant-token scopes:

- `base:field:read`: inspect the existing field schema.
- `base:record:retrieve`: check existing records for duplicates.
- `base:record:create`: add a selected procurement record.
- `wiki:node:read`: resolve the fixed wiki node to the actual Base.
- `bitable:app:readonly`: Base read access; this was necessary for the app to
  appear in the Base's app-addition search in the current console.

Bot capability is enabled for document-app integration. No chat scopes, message
subscriptions, record deletion/update scopes, field modification scopes, or
organization-wide data permissions were added.

Sites runtime revision **3** stores all three connection values. App Secret and
the actual Base token are marked as secrets. The token was resolved through
the official wiki API and `obj_type=bitable` was verified. Credentials are not
part of the repository. Updating runtime values does not apply them to the
currently published version until a separately requested deployment.

### Base access

The user explicitly approved granting **SFL 入札リンクポータル連携** the
**編集可能** role on the entire **【SFL/LUCIA】入札案件管理** Base on
2026-09-11. The app was then added successfully; the Base's added-app list
confirms its name and **編集可能** role. The available Base roles are view,
edit, and manage; no create-only role is offered in that dialog. The earlier
automatic approval block was resolved by this specific user approval.

The portal still restricts writes to the five fields below and the fixed three
tables. Do not modify the existing Base fields, ordinary records, sharing for
people, or the removed automations while completing the connection.

## Field mapping

| Existing Base field | Value |
| --- | --- |
| 都道府県 | Existing matching single-select option; otherwise omitted |
| 種別管理 | Existing 全省庁統一資格必須 or オープンカウンター option |
| 案件先機関名 | Procurement agency |
| 案件先URL | Hyperlink with the procurement title as its display text |
| 提出期限 | Confirmed deadline, midnight in Asia/Tokyo, epoch milliseconds |

When both classifications apply, use 全省庁統一資格必須 because the Base field is
single-select. Unknown or unsupported choices are omitted and disclosed on the
registered row. No API modifies fields or creates new select options. Assignees,
amounts, checkboxes, auto numbers, and relationship fields are never written.

## Authentication, persistence, and failure handling

All routes use the existing server-side membership checks. Mutations additionally
check the request origin and JSON content type. The registration endpoint rejects
deadlines that are no longer strictly later than today's date in Japan.

`lark_bid_registrations` stores the target-specific deduplication key, stable
Lark client token, record ID, warnings, and a 90-second database lease. It contains
no API secrets. The migration only adds this table. The old research-job schema
is retained solely to prevent unrelated deletion during migration generation;
no research feature was restored.

Before creating a record, inspect the destination field schema and search its
existing records using only the agency and URL fields. Match the canonical URL,
agency, and title. Bound the read to 5,000 records and 45 seconds; incomplete
checks stop the write. Use the saved UUID as Lark's `client_token`. Lost or invalid
write responses are marked uncertain; later clicks read Lark to reconcile them
instead of automatically sending another create request. If no matching record
appears, an operator must inspect Lark before resetting that one uncertain job.

`GET /api/lark/connection` is owner-only and checks authentication, all three
destination tables, and their five field types without adding records. This is
available through **設定・メンバー → Larkへの案件登録 → 接続を確認**.
Field checks do not prove record-create permission; verify a user-selected
record after the app is approved and deployed.

## Verification

Live read-only checks on 2026-09-11 succeeded against the official Lark API:
tenant authentication, fixed wiki-node resolution, field listing for all three
tables, and record search limited to agency/URL fields. Each table has all five
expected field types, the 47 prefectures, and the two existing classification
options; each search returned five records with no additional page. No record
was created or changed. Base edit access is now configured. Record creation and
the deployed portal-to-Lark flow remain unverified until the portal is published
and a user-selected procurement record is registered.

`tests/lark-registration.test.mjs` uses a real in-memory SQLite database with the
production migrations and a simulated Lark HTTP service. It covers membership,
origin validation, target restrictions, five-field mapping, future dates,
concurrent clicks, persistent deduplication, lost responses, existing records,
schema mismatch, and errors without credential disclosure.

Official API contract: `@larksuiteoapi/node-sdk` 1.73.3 type definitions,
`appTableRecord.create/search`, `appTableField.list`, and `wiki.space.getNode`.
Lark API reference:
https://open.larksuite.com/document/server-docs/docs/bitable-v1/app-table-record/create


## Per-member template workflow (September 18, 2026)

Members clone a clean SFL Base template into their own Lark organization. The
owner sets an empty distribution template URL under Settings. This URL is not
seeded from the operational SFL Base. It must be prepared without actual cases,
personal data, or external data links and shared with native copying permitted.
The portal does not change source Base sharing or clone actual SFL records.
Until that URL is supplied, setup states that the distribution link is pending.

Each clone retains three destination tables and the five field names/types above.
In Settings, the member (or the owner acting on a selected account) enters their
organization's custom App ID/Secret and the URL of each copied table. The app must
be published in that organization, have the necessary API scopes, and have edit
access on the copied Base. Setup authenticates and reads all three field schemas;
it never creates test cases and does not claim to prove record-create permission.

`member_lark_connections` binds the stable authenticated account ID to the verified
Base token, table mapping, opaque revision and encrypted app secret. A separate
random `LARK_CONNECTION_ENCRYPTION_KEY` (32 bytes, lowercase hex) is a Sites runtime
secret. AES-256-GCM uses a fresh IV and the account ID as authenticated additional
data. Do not rotate the encryption key without re-encrypting saved secrets.
Secrets never appear in settings responses, browser storage, or logs. Existing
secrets can be retained only when the app ID matches. Failed validation preserves
the prior connection; competing edits compare the saved revision.

The operational SFL app/Base and other members' connected Bases are rejected.
All external requests remain pinned to the Lark API origin without redirects.
Each registration requires the revision of the destination shown to the member.
Deduplication keys and discovery registration flags include the account, actual
Base and table mapping. The existing SFL history retains its legacy `sfl` scope.
There is no SFL fallback for an unconfigured or disconnected member. Disconnecting
removes the stored connection key but does not delete any Lark records or history.

Routes:
- GET/POST/DELETE `/api/lark/member-connection`: member's own connection.
- Same path with `accountId`: owner-only assisted setup for an active account.
- POST `/api/lark/template`: owner-only distribution template URL.

Validation uses real SQLite migrations and mocked provider HTTP. It covers two
independent members, SFL isolation, credential separation/encryption, duplicate
prevention, stale revisions, invalid schemas, missing setup, unsafe URLs, CSRF,
owner-assisted setup and disconnection. No external member Base has been connected
or written to during implementation; that requires the member's real app and clone.
