# Daily Message Display

A Cloudflare Worker that displays rotating daily safety messages and images on fire station display screens. Text messages are managed via a Google Sheet; images are managed by dropping files into a Google Drive folder. No technical knowledge is required to add or update content.

## 📄 System Documentation
Full documentation (architecture, setup, account transfer, IT reference): https://github.com/wehnerb/ffd-display-system-documentation

---

## Live URLs

| Environment | URL |
|---|---|
| Production | `https://daily-message-display.bwehner.workers.dev/` |
| Staging | `https://daily-message-display-staging.bwehner.workers.dev/` |

---

## Layout Parameter

| Parameter | Default | Options |
|---|---|---|
| `?layout=` | `wide` | `full`, `wide`, `split`, `tri` |

| Layout | Width | Height |
|---|---|---|
| `full` | 1920px | 1075px |
| `wide` | 1735px | 720px |
| `split` | 852px | 720px |
| `tri` | 558px | 720px |

---

## Managing Content

### Text Messages
Add rows to the **Messages** tab of the Google Sheet. Key columns:

| Column | Required | Description |
|---|---|---|
| `Date` | No | `YYYY-MM-DD` to pin to a specific date; leave blank for rotation |
| `Content` | Yes | Message or quote text |
| `Attribution` | No | Author or source line |
| `Active` | Yes | `yes` to include, `no` to temporarily exclude |

### Images
Drop image files into the **Fire Station Display — Daily Images** Google Drive folder. Keep files under 5 MB. To deactivate without deleting, move to any subfolder. To pin to a date, prefix the filename: `2026-03-25-filename.jpg`.

If both a text message and an image are pinned to the same date, the **image takes priority**.

---

## Configuration (`src/index.js`)

| Constant | Default | Description |
|---|---|---|
| `ROTATION_DAYS` | `3` | Days each message displays before advancing |
| `ROTATION_ANCHOR` | `2026-01-23` | Anchor date for rotation cycle — do not change unless resetting |
| `DEFAULT_LAYOUT` | `'wide'` | Layout when no `?layout=` parameter is provided |
| `SHEET_TAB_NAME` | `'Messages'` | Data tab name in the Google Sheet |
| `ERROR_RETRY_SECONDS` | `60` | Seconds before the error page auto-retries |
| `MIN_REFRESH_SECONDS` | `300` | Minimum meta-refresh interval before next 7:30 AM rotation |

---

## Secrets

| Secret | Description |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token — Workers edit permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email — shared with `slide-timing-proxy` |
| `GOOGLE_PRIVATE_KEY` | RSA private key from Google Cloud JSON key file — shared with `slide-timing-proxy` |
| `GOOGLE_SHEET_ID` | Sheet ID — found in the URL between `/d/` and `/edit` |
| `GOOGLE_DRIVE_FOLDER_ID` | Drive folder ID — found in the URL after `/folders/` |

---

## Deployment

| Branch | Deploys To | Purpose |
|---|---|---|
| `staging` | `daily-message-display-staging.bwehner.workers.dev` | Testing |
| `main` | `daily-message-display.bwehner.workers.dev` | Production |

Push to either branch — GitHub Actions deploys automatically (~30–45 sec).  
**Always stage and test before merging to main.**  
To roll back: use the Cloudflare dashboard **Deployments** tab, then revert the commit on `main`.
