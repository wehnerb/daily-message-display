# Daily Message Display

A Cloudflare Worker that displays rotating daily safety messages and images on fire station display screens. Text messages are managed via a Google Sheet; images are managed by dropping files into a Google Drive folder. No technical knowledge is required to add or update content.

## Live URLs

|Environment|URL                                                         |
|-----------|------------------------------------------------------------|
|Production |`https://daily-message-display.bwehner.workers.dev/`        |
|Staging    |`https://daily-message-display-staging.bwehner.workers.dev/`|

## URL Parameters

|Parameter|Default|Options                       |Description                                                                                                                                                                                |
|---------|-------|------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`layout` |`wide` |`full`, `wide`, `split`, `tri`|Column width matching display hardware. The “Daily Safety Message” title label is only shown in the `full` layout — other layouts have a built-in title bar provided by the display system.|

### Example URLs

```
# Full-screen display (default)
https://daily-message-display.bwehner.workers.dev/

# Two-column split layout
https://daily-message-display.bwehner.workers.dev/?layout=split

# Three-column layout
https://daily-message-display.bwehner.workers.dev/?layout=tri
```

### Layout Dimensions

|Layout |Width (px)|Height (px)|Use Case                       |
|-------|----------|-----------|-------------------------------|
|`full` |1920      |1080       |Full-screen display            |
|`wide` |1735      |720        |Single-column display (default)|
|`split`|852       |720        |Two-column display             |
|`tri`  |558       |720        |Three-column display           |

-----

## How It Works

1. The Worker authenticates with Google using a shared service account (same account as `slide-timing-proxy`), generating a short-lived OAuth2 access token.
1. The Worker fetches the Messages tab from Google Sheets and lists image files in the Google Drive folder in parallel.
1. Date override entries are checked first. If today’s date matches a pinned image filename prefix or a sheet row’s Date column, that entry is selected. Images take priority over text if both are pinned to the same date.
1. If no date override matches, a combined rotation pool is built by interleaving active text entries and image files evenly. The pool index is determined by: `floor(daysElapsed / ROTATION_DAYS) % poolSize`, anchored to January 23, 2026 in America/Chicago time.
1. For image entries, the Worker fetches the image from Drive server-side and encodes it as a base64 data URI. The display browser never contacts Google directly.
1. A self-contained HTML page is returned. The `meta http-equiv="refresh"` interval is set to the exact number of seconds until the next 7:30 AM Central rotation, limiting Worker invocations to approximately one per station per day.

-----

## Rotation Logic

Messages rotate every `ROTATION_DAYS` calendar days (default: 3). With 3-day blocks aligned to the department’s 9-day shift rotation, each message is guaranteed to be seen by all three shifts before advancing. The rotation is anchored to January 23, 2026. Day boundaries and cache TTL calculations use `America/Chicago` time via the `Intl.DateTimeFormat` API — DST transitions are handled correctly.

Text and image entries are combined into a single pool with the two types interleaved as evenly as possible, so images are spread throughout the cycle rather than grouped at the end.

-----

## Managing Content

### Text Messages

Open the **Fire Station Display — Daily Messages** Google Sheet and add rows to the **Messages** tab. See the sheet’s **Instructions** tab for full column guidance.

|Column     |Required|Description                                                                                                                                              |
|-----------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------|
|Date       |No      |Optional date pin in `YYYY-MM-DD` format. Forces this message to display on that specific date, bypassing normal rotation. Leave blank for rotation pool.|
|Content    |Yes     |The message or quote text to display.                                                                                                                    |
|Attribution|No      |Source or author displayed beneath the message (e.g. NFPA, Chief Smith). Leave blank for no attribution line.                                            |
|Active     |Yes     |Enter `yes` to include in rotation. Enter `no` to temporarily exclude without deleting the row.                                                          |

Columns are read by **header name** — they can be reordered or new columns added without any code changes. The header row is protected with an edit warning.

### Images

Drop image files (JPG, PNG, etc.) directly into the **Fire Station Display — Daily Images** Google Drive folder. The Worker will include them automatically in the next rotation cycle.

- **Optimize images** to a reasonable file size before uploading — files over 5 MB may cause the Worker to exceed Cloudflare’s memory limits.
- **To deactivate an image** without deleting it, move it into any subfolder. The Worker only reads files in the root of the Drive folder — all subfolders are ignored entirely.
- **To pin an image to a specific date**, rename the file with a date prefix: `2026-03-25-filename.jpg`. Use `YYYY-MM-DD` format.

### Date Override Priority

If both a text message and an image are pinned to the same date, the **image takes priority**.

Date overrides bypass the rotation pool entirely — pinned entries do not consume a rotation slot.

-----

## Configuration

The top of `src/index.js` contains all values that may need to be changed. No other section should require editing for routine operation.

|Constant             |Default     |Description                                                                                                                           |
|---------------------|------------|--------------------------------------------------------------------------------------------------------------------------------------|
|`ROTATION_DAYS`      |`3`         |Number of calendar days each message displays before advancing. Change to `1` for daily rotation. Sub-daily rotation is not supported.|
|`ROTATION_ANCHOR`    |`2026-01-23`|Anchor date from which all block boundaries are calculated. Do not change unless intentionally resetting the rotation cycle.          |
|`IMAGE_SOURCE`       |`'drive'`   |Active image source. Options: `'drive'` (Google Drive) or `'network'` (internal network share — stubbed for future use).              |
|`DEFAULT_LAYOUT`     |`'wide'`    |Layout used when no `?layout=` parameter is provided.                                                                                 |
|`SHEET_TAB_NAME`     |`'Messages'`|Name of the data tab in the Google Sheet. Update if the tab is ever renamed.                                                          |
|`ERROR_RETRY_SECONDS`|`60`        |How long the error page waits before auto-retrying.                                                                                   |
|`MIN_REFRESH_SECONDS`|`300`       |Minimum meta-refresh interval — prevents very short refresh windows just before 7:30 AM.                                              |

-----

## Secrets

All credentials are stored as Cloudflare Worker secrets and GitHub Actions secrets. They are never present in source code.

|Secret                        |Description                                                                        |
|------------------------------|-----------------------------------------------------------------------------------|
|`CLOUDFLARE_API_TOKEN`        |Cloudflare API token with Workers edit permissions.                                |
|`CLOUDFLARE_ACCOUNT_ID`       |Cloudflare account ID.                                                             |
|`GOOGLE_SERVICE_ACCOUNT_EMAIL`|Service account email — shared with `slide-timing-proxy`.                          |
|`GOOGLE_PRIVATE_KEY`          |RSA private key from Google Cloud JSON key file — shared with `slide-timing-proxy`.|
|`GOOGLE_SHEET_ID`             |ID of the Google Sheet. Found in the Sheet URL between `/d/` and `/edit`.          |
|`GOOGLE_DRIVE_FOLDER_ID`      |ID of the Google Drive image folder. Found in the folder URL after `/folders/`.    |

Both the Google Sheet and Drive folder must be shared with the service account email. The service account uses the `drive.readonly` scope — read-only access to Sheets and Drive.

-----

## Network Share (Future Use)

The Worker includes a stubbed code path for fetching images from an internal network share instead of Google Drive. To activate it:

1. Set `IMAGE_SOURCE = 'network'` in `src/index.js`.
1. Add the following secrets to Cloudflare Worker settings and to both the `secrets:` and `env:` blocks in `.github/workflows/deploy.yml`:

|Secret                  |Required|Description                                                                                                                                                                                             |
|------------------------|--------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
|`NETWORK_SHARE_URL`     |Yes     |Full URL to the directory listing on the network share. The server must return either a JSON array of filenames or an HTML directory listing with anchor tags. For a public share, set only this secret.|
|`NETWORK_SHARE_USERNAME`|No      |HTTP Basic auth username (only if the share is password-protected).                                                                                                                                     |
|`NETWORK_SHARE_PASSWORD`|No      |HTTP Basic auth password (only if the share is password-protected). Credentials are only ever sent from the Worker to the internal server — never exposed to the display browser.                       |

The date-override filename prefix convention (`YYYY-MM-DD-filename.jpg`) and subfolder exclusion behavior are identical to the Google Drive implementation. See `src/index.js` for full inline documentation.

-----

## Deployment

This repository uses two branches. All changes must go through staging before being merged to main.

|Branch   |Deploys To                                         |Purpose                    |
|---------|---------------------------------------------------|---------------------------|
|`staging`|`daily-message-display-staging.bwehner.workers.dev`|Testing and validation     |
|`main`   |`daily-message-display.bwehner.workers.dev`        |Live production environment|

GitHub Actions deploys automatically on every push to either branch via the `wrangler-action` workflow. Deployment takes approximately 30–45 seconds.

### Making a Change

1. Switch to the `staging` branch and edit `src/index.js`.
1. Commit — GitHub Actions will deploy to the staging Worker automatically.
1. Test the staging URL in a browser and on actual display hardware.
1. Create a Pull Request from `staging` → `main` and merge to deploy to production.

### Rolling Back

Use the Cloudflare dashboard **Deployments** tab for immediate stabilization, then use GitHub’s Revert feature on the `main` branch to resync the repository.

-----

## Security Notes

- All credentials are stored as secrets — never in source code.
- Only `GET` requests are accepted. All other HTTP methods return `405`.
- URL parameters are sanitized before use.
- All user-provided content (sheet text, attributions) is HTML-escaped before injection into pages to prevent XSS.
- `X-Frame-Options` is intentionally **not** set — this Worker is loaded as a full-screen iframe by the display system. Adding `SAMEORIGIN` would cause immediate white screens on every station display.
- Drive and network share images are fetched server-side. The display browser never contacts Google Drive or the network share directly.
- `Cache-Control: no-store` is set on all HTML responses to prevent browser caching.
