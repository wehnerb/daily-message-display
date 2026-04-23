import { fetchWithTimeout } from './shared/fetch-helpers.js';
import { escapeHtml, sanitizeParam } from './shared/html.js';
import { getAccessToken } from './shared/google-auth.js';
import { getTodayString, getDaysElapsed, getBlockIndex, getSecondsUntilNextRotation } from './shared/rotation.js';
import { DARK_BG_COLOR, FONT_STACK, ACCENT_COLOR, TEXT_PRIMARY, TEXT_SECONDARY, TEXT_TERTIARY, BORDER_SUBTLE, BORDER_STRONG, CARD_BASE, CARD_ELEVATED, CARD_HEADER, CARD_RECESSED } from './shared/colors.js';
import { LAYOUTS } from './shared/layouts.js';

// =============================================================================
// daily-message-display — Cloudflare Worker
// =============================================================================
// Fetches daily safety messages and images from Google Sheets and Google Drive
// and renders them as a styled HTML page for fire station displays.
//
// Content sources:
//   - Text messages: Google Sheets (Messages tab)
//   - Images:        Google Drive folder (root files only; subfolders ignored)
//   - Network share: Stubbed for future use — see NETWORK SHARE CONFIGURATION
//
// Rotation logic:
//   - Messages display for ROTATION_DAYS consecutive days before advancing
//   - Rotation anchored to ROTATION_ANCHOR (January 23, 2026)
//   - Day boundary at ROTATION_TIME (7:30 AM Central) — DST-safe
//   - Text and image pools interleaved evenly in a single combined pool
//   - Date overrides bypass rotation; image wins if both types pinned same day
//
// Caching strategy:
//   - meta http-equiv="refresh" set to seconds until next 7:30 AM Central
//   - This limits Worker invocations to approximately once per station per day
//   - Cache-Control: no-store on all HTML responses (prevents browser caching)
//   - Upstream API calls (Sheets, Drive) always fetched fresh per invocation
//
// Security:
//   - All credentials stored as Cloudflare Worker secrets — never in source code
//   - URL parameters sanitized before use
//   - All user-provided content HTML-escaped before injection into pages
//   - No X-Frame-Options header — this Worker is loaded as a full-screen iframe
//     by the display system; SAMEORIGIN would cause immediate white screens
//   - Drive/network images proxied server-side — displays never contact image
//     sources directly
// =============================================================================


// -----------------------------------------------------------------------------
// CONFIGURATION — edit values in this section only for routine operation.
// No other section should require changes.
// -----------------------------------------------------------------------------

// Number of consecutive calendar days each message displays before advancing.
// Change to 1 for daily rotation, 2 for every-other-day, etc.
// Sub-daily rotation is not supported; the minimum unit is 1 day.
const ROTATION_DAYS = 3;

// Anchor date for the rotation cycle in YYYY-MM-DD format.
// All block boundaries are calculated relative to this date in Central time.
// Value: January 23, 2026 — a confirmed reference point in the department's
// 9-day shift rotation. Do not change unless intentionally resetting the cycle.
const ROTATION_ANCHOR = '2026-01-23';

// Time of day when the message advances to the next block, in America/Chicago
// time. Matches the department shift change. { hour: 24-hour, minute: 0-59 }
const ROTATION_TIME = { hour: 7, minute: 30 };

// Default layout when no ?layout= parameter is provided.
// Options: 'full', 'wide', 'split', 'tri'
const DEFAULT_LAYOUT = 'wide';

// Active image source.
//   'drive'   — Google Drive folder (uses GOOGLE_DRIVE_FOLDER_ID secret)
//   'network' — Internal network share (uses NETWORK_SHARE_URL and optionally
//               NETWORK_SHARE_USERNAME / NETWORK_SHARE_PASSWORD secrets)
//               See NETWORK SHARE CONFIGURATION section below for full details.
const IMAGE_SOURCE = 'drive';

// Name of the data tab in the Google Sheet.
// Update this constant if the tab is ever renamed.
const SHEET_TAB_NAME = 'Messages';

// How long the error/retry page waits before reloading (seconds).
const ERROR_RETRY_SECONDS = 60;

// Minimum meta-refresh interval in seconds. Prevents the refresh interval
// from becoming unreasonably short if the Worker runs just before 7:30 AM.
const MIN_REFRESH_SECONDS = 300;

// -----------------------------------------------------------------------------
// NETWORK SHARE CONFIGURATION (future use — not yet active)
// -----------------------------------------------------------------------------
// To switch to a network share image source:
//   1. Set IMAGE_SOURCE = 'network' above.
//   2. Add the following secrets to the Cloudflare Worker settings and to
//      the deploy.yml file (both the 'secrets:' block and the 'env:' block):
//
//   NETWORK_SHARE_URL
//     Full URL to the directory containing image files on the network share.
//     Example: https://intranet.fargond.gov/fire/display-images/
//     The server must return either:
//       (a) A JSON array of filename strings: ["file1.jpg", "file2.jpg"]
//       (b) An HTML directory listing containing <a href="filename.ext"> links
//     Files in subdirectories are ignored (same behavior as Google Drive).
//     For a public share, set only this secret and omit the credentials below.
//
//   NETWORK_SHARE_USERNAME  (optional — only required if the share is protected)
//     Username for HTTP Basic authentication.
//     Leave unset for public shares — no Authorization header will be sent.
//
//   NETWORK_SHARE_PASSWORD  (optional — only required if the share is protected)
//     Password for HTTP Basic authentication.
//     Leave unset for public shares.
//     Credentials are only ever sent from the Worker to the internal server —
//     they are never exposed to the display browser.
//
// Date-override naming convention is identical to Google Drive:
//   2026-03-25-filename.jpg
//
// To deactivate a network share image without deleting it, move the file into
// any subdirectory on the share. The Worker only reads the root directory.
// -----------------------------------------------------------------------------


// =============================================================================
// MAIN WORKER ENTRY POINT
// =============================================================================

export default {
  async fetch(request, env) {

    // Reject non-GET requests with a generic status to reduce attack surface.
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Parse and validate the layout URL parameter before entering the try block
    // so the error page renderer always has a valid layout to work with.
    const url         = new URL(request.url);
    const layoutParam = sanitizeParam(url.searchParams.get('layout')) || DEFAULT_LAYOUT;
    // layoutKey is the resolved string name ('full', 'wide', 'split', 'tri').
    // Passed to buildTextPage so it can conditionally show the title label,
    // which is only appropriate on the full layout (other layouts have a
    // built-in title bar provided by the display system).
    const layoutKey   = (layoutParam in LAYOUTS) ? layoutParam : DEFAULT_LAYOUT;
    const layout      = LAYOUTS[layoutKey];

    // ?bg=dark renders with a solid dark background for browser-based testing.
    // Matches the probationary-firefighter-display ?bg=dark parameter behaviour.
    const darkBg = sanitizeParam(url.searchParams.get('bg')) === 'dark';

    var REQUIRED_SECRETS = [
      'GOOGLE_SERVICE_ACCOUNT_EMAIL',
      'GOOGLE_PRIVATE_KEY',
      'GOOGLE_SHEET_ID',
      'GOOGLE_DRIVE_FOLDER_ID'
    ];
    for (var i = 0; i < REQUIRED_SECRETS.length; i++) {
      var key = REQUIRED_SECRETS[i];
      if (!env[key]) {
        console.error('[daily-message-display] Missing required secret: ' + key);
        return renderErrorPage(
          'CONFIGURATION ERROR',
          'Missing secret: ' + key,
          layout,
          darkBg
        );
      }
    }

    try {
      // Get today's date string in America/Chicago time (YYYY-MM-DD).
      // All rotation logic uses this value so DST is handled consistently.
      const todayStr = getTodayString(ROTATION_TIME);

      // Obtain one Google OAuth2 access token and reuse it for all API calls.
      // Both the Sheets API and Drive API accept the same drive.readonly token.
      const accessToken = await getAccessToken(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        env.GOOGLE_PRIVATE_KEY,
        'https://www.googleapis.com/auth/drive.readonly'
      );

      // Fetch text entries from Google Sheets and image entries from the
      // configured image source in parallel for efficiency.
      const [textEntries, imageEntries] = await Promise.all([
        fetchTextEntries(env, accessToken),
        fetchImageEntries(env, accessToken),
      ]);

      // --- Date override check ---
      // Check for pinned entries before consulting the rotation pool.
      // Image takes priority if both a text message and an image are pinned
      // to the same date.
      const pinnedImage = imageEntries.find(e => e.pinnedDate === todayStr);
      const pinnedText  = textEntries.find(e => e.date === todayStr);

      let selected;

      if (pinnedImage) {
        selected = pinnedImage;
      } else if (pinnedText) {
        selected = pinnedText;
      } else {
        // --- Rotation pool ---
        // Exclude date-pinned entries from the rotation pool, then build a
        // combined interleaved pool. Select by the current block index.
        const poolText   = textEntries.filter(e => !e.date);
        const poolImages = imageEntries.filter(e => !e.pinnedDate);
        const pool       = buildInterleavedPool(poolText, poolImages);

        if (pool.length === 0) {
          return renderErrorPage(
            'NO MESSAGES AVAILABLE',
            'Check content sources',
            layout,
            darkBg
          );
        }

        const blockIndex = getBlockIndex(todayStr, ROTATION_ANCHOR, ROTATION_DAYS);
        selected = pool[blockIndex % pool.length];
      }

      // --- Cache TTL ---
      // Set to seconds until the next 7:30 AM Central rotation.
      // The meta-refresh in the rendered page uses this value so the display
      // reloads approximately once per day rather than on every cycle.
      const refreshSeconds = Math.max(
        MIN_REFRESH_SECONDS,
        getSecondsUntilNextRotation(ROTATION_TIME)
      );

      // --- Render ---
      let html;

      if (selected.type === 'image') {
        const imageData = await fetchImageData(selected, env, accessToken);

        if (!imageData) {
          // Image fetch failed — fall back to the first non-pinned text entry.
          const fallbackText = textEntries.filter(e => !e.date)[0];
          if (fallbackText) {
            console.error(
              'Image fetch failed for "' + selected.name +
              '"; falling back to text entry.'
            );
            html = buildTextPage(fallbackText, layout, layoutKey, refreshSeconds, darkBg);
          } else {
            return renderErrorPage('IMAGE UNAVAILABLE', 'Retrying shortly', layout, darkBg);
          }
        } else {
          html = buildImagePage(imageData, layout, refreshSeconds, darkBg);
        }
      } else {
        html = buildTextPage(selected, layout, layoutKey, refreshSeconds, darkBg);
      }

      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });

    } catch (err) {
      console.error('Worker unhandled error:', err);
      return renderErrorPage('DISPLAY UNAVAILABLE', 'Retrying shortly', layout, darkBg);
    }
  },
};



// =============================================================================
// POOL BUILDING
// =============================================================================

// Builds a single ordered pool by interleaving text and image entries as evenly
// as possible. The minority type is distributed throughout the larger pool
// rather than being grouped at the beginning or end.
//
// Works symmetrically regardless of which pool is larger — 30 texts + 3 images
// produces the same even distribution logic as 3 texts + 30 images.
// Equal counts alternate one-for-one.
function buildInterleavedPool(textEntries, imageEntries) {
  if (textEntries.length === 0)  return imageEntries;
  if (imageEntries.length === 0) return textEntries;

  // Determine larger and smaller pools for the distribution algorithm.
  const larger  = textEntries.length >= imageEntries.length ? textEntries  : imageEntries;
  const smaller = textEntries.length <  imageEntries.length ? textEntries  : imageEntries;

  const pool  = [];
  const ratio = larger.length / smaller.length;
  let si = 0; // current index into the smaller pool

  for (let li = 0; li < larger.length; li++) {
    pool.push(larger[li]);

    // After every `ratio` larger-pool items, insert one smaller-pool item.
    // Math.round distributes smaller items as evenly as possible throughout
    // the larger pool without front-loading or back-loading them.
    if (si < smaller.length && li >= Math.round((si + 1) * ratio) - 1) {
      pool.push(smaller[si]);
      si++;
    }
  }

  // Append any remaining smaller-pool items (handles rounding edge cases
  // where the last insertion point falls beyond the end of the larger pool).
  while (si < smaller.length) {
    pool.push(smaller[si++]);
  }

  return pool;
}


// =============================================================================
// GOOGLE SHEETS — fetch text entries
// =============================================================================

// Fetches all active text entries from the Messages tab of the Google Sheet.
// Columns are located by header name (case-insensitive) so entries can be
// reordered and new columns added without requiring any code changes.
async function fetchTextEntries(env, accessToken) {
  const sheetUrl =
    'https://sheets.googleapis.com/v4/spreadsheets/' +
    encodeURIComponent(env.GOOGLE_SHEET_ID) +
    '/values/' +
    encodeURIComponent(SHEET_TAB_NAME) +
    '?majorDimension=ROWS';

  const res = await fetchWithTimeout(sheetUrl, {
    headers: { 'Authorization': 'Bearer ' + accessToken },
    cf: { cacheTtl: 0 }, // always fetch fresh data on each Worker invocation
  }, 8000);

  if (!res.ok) {
    // Log full details server-side; do not surface specifics to the display.
    console.error('Sheets API error (' + res.status + '): ' + await res.text());
    return [];
  }

  const data = await res.json();
  const rows = data.values || [];

  if (rows.length < 2) return []; // empty sheet or header row only

  // Map each column header name to its zero-based index (case-insensitive).
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const col     = name => headers.indexOf(name.toLowerCase());

  const dateCol        = col('date');
  const contentCol     = col('content');
  const attributionCol = col('attribution');
  const activeCol      = col('active');

  // Required columns must be present. If any are missing, log and return empty
  // so the Worker degrades gracefully rather than throwing an unhandled error.
  // Note: the Type column was intentionally removed — all sheet rows are text
  // entries by definition. Images are managed exclusively via the Drive folder.
  if (contentCol === -1 || activeCol === -1) {
    console.error(
      'Google Sheet is missing one or more required columns. ' +
      'Expected: content, active. ' +
      'Columns found: ' + headers.join(', ')
    );
    return [];
  }

  const entries = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const active      = (row[activeCol]      || '').trim().toLowerCase();
    const content     = (row[contentCol]     || '').trim();
    const date        = dateCol        !== -1 ? (row[dateCol]        || '').trim() : '';
    const attribution = attributionCol !== -1 ? (row[attributionCol] || '').trim() : '';

    // Skip rows that are not active or have no content.
    // All sheet rows are treated as text entries — images are Drive-managed.
    if (active  !== 'yes') continue;
    if (!content)          continue;

    // Validate date format if provided. Log and skip rows with bad dates to
    // prevent silent failures that would corrupt the rotation pool.
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      console.error(
        'Row ' + (i + 1) + ' skipped — invalid date format: "' + date +
        '". Expected YYYY-MM-DD.'
      );
      continue;
    }

    entries.push({ type: 'text', date, content, attribution });
  }

  return entries;
}


// =============================================================================
// GOOGLE DRIVE — fetch image file listing
// =============================================================================

// Fetches the list of image files in the root of the configured Drive folder.
// Subfolders are excluded by the Drive API query (mimeType check).
// Date-pinned images are identified by a YYYY-MM-DD- filename prefix.
async function fetchImageEntries(env, accessToken) {
  if (IMAGE_SOURCE === 'network') {
    return fetchNetworkImageEntries(env);
  }

  // Query Drive for files directly in the target folder that are not folders
  // themselves and have not been trashed. The mimeType filter excludes all
  // Google Apps file types and subfolders in a single query.
  const query =
    "'" + env.GOOGLE_DRIVE_FOLDER_ID + "' in parents" +
    " and mimeType != 'application/vnd.google-apps.folder'" +
    " and trashed = false";

  const driveUrl =
    'https://www.googleapis.com/drive/v3/files' +
    '?q=' + encodeURIComponent(query) +
    '&fields=files(id,name,mimeType)' +
    '&pageSize=100';

  const res = await fetchWithTimeout(driveUrl, {
    headers: { 'Authorization': 'Bearer ' + accessToken },
    cf: { cacheTtl: 0 },
  }, 8000);

  if (!res.ok) {
    console.error('Drive API error (' + res.status + '): ' + await res.text());
    return [];
  }

  const data  = await res.json();
  const files = data.files || [];

  const entries    = [];
  const datePrefix = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

  for (const file of files) {
    // Defense-in-depth: only include recognized image MIME types even though
    // the Drive query already filters out folders and Google Apps files.
    if (!file.mimeType || !file.mimeType.startsWith('image/')) continue;

    const match      = file.name.match(datePrefix);
    const pinnedDate = match ? match[1] : null;

    entries.push({
      type:       'image',
      source:     'drive',
      id:         file.id,
      name:       file.name,
      mimeType:   file.mimeType,
      pinnedDate,
    });
  }

  return entries;
}


// =============================================================================
// NETWORK SHARE — fetch image file listing (future use, stubbed)
// =============================================================================
// Called when IMAGE_SOURCE = 'network'. This is a functional stub that can
// be activated once the network share URL and response format are confirmed.
// See NETWORK SHARE CONFIGURATION at the top of this file for setup details.

async function fetchNetworkImageEntries(env) {
  if (!env.NETWORK_SHARE_URL) {
    console.error(
      'IMAGE_SOURCE is set to "network" but the NETWORK_SHARE_URL secret is not set. ' +
      'Add NETWORK_SHARE_URL to Cloudflare Worker secrets and to deploy.yml.'
    );
    return [];
  }

  // Build the Authorization header only if credentials are provided.
  // For a public share, omit both NETWORK_SHARE_USERNAME and
  // NETWORK_SHARE_PASSWORD and no Authorization header will be sent.
  const headers = {};
  if (env.NETWORK_SHARE_USERNAME && env.NETWORK_SHARE_PASSWORD) {
    headers['Authorization'] =
      'Basic ' + btoa(env.NETWORK_SHARE_USERNAME + ':' + env.NETWORK_SHARE_PASSWORD);
  }

  const res = await fetchWithTimeout(env.NETWORK_SHARE_URL, {
    headers,
    cf: { cacheTtl: 0 },
  }, 8000);

  if (!res.ok) {
    console.error(
      'Network share fetch error (' + res.status + ') at: ' + env.NETWORK_SHARE_URL
    );
    return [];
  }

  // Parse the directory listing. The server must return either:
  //   (a) A JSON array of filename strings: ["file1.jpg", "file2.jpg"]
  //   (b) An HTML directory listing with <a href="filename.ext"> anchor tags
  // Adjust the parsing block below to match the actual server format once known.
  const contentType = res.headers.get('content-type') || '';
  let filenames = [];

  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (Array.isArray(json)) {
      filenames = json.filter(f => typeof f === 'string');
    }
  } else {
    // Parse HTML directory listing — extract href values pointing to images.
    const html = await res.text();
    const hrefPattern = /href="([^"?#]+\.(jpg|jpeg|png|gif|webp))"/gi;
    let match;
    while ((match = hrefPattern.exec(html)) !== null) {
      filenames.push(match[1]);
    }
  }

  const entries    = [];
  const datePrefix = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

  for (const filename of filenames) {
    // Strip any path prefix — only use the bare filename.
    const cleanName  = filename.replace(/^.*\//, '');
    const match      = cleanName.match(datePrefix);
    const pinnedDate = match ? match[1] : null;

    entries.push({
      type:       'image',
      source:     'network',
      url:        env.NETWORK_SHARE_URL.replace(/\/$/, '') + '/' + cleanName,
      name:       cleanName,
      mimeType:   'image/jpeg', // default assumption; adjust if server returns MIME types
      pinnedDate,
    });
  }

  return entries;
}


// =============================================================================
// IMAGE FETCHING — server-side proxy
// =============================================================================
// Fetches the binary image data server-side and returns it as a base64
// data URI. The display browser receives only the embedded data URI —
// it never contacts Google Drive or the network share directly.
//
// Returns { dataUri, mimeType } on success, or null on any failure.
// Note: images should be optimized to a reasonable file size before adding
// to the Drive folder or network share. Very large files (>5 MB) may cause
// the Worker to exceed Cloudflare's memory limits.
async function fetchImageData(entry, env, accessToken) {
  try {
    let res;

    if (entry.source === 'network') {
      // Network share — use the same Basic auth as the directory listing.
      const headers = {};
      if (env.NETWORK_SHARE_USERNAME && env.NETWORK_SHARE_PASSWORD) {
        headers['Authorization'] =
          'Basic ' + btoa(env.NETWORK_SHARE_USERNAME + ':' + env.NETWORK_SHARE_PASSWORD);
      }
      res = await fetchWithTimeout(entry.url, { headers }, 8000);

    } else {
      // Google Drive — request the file's binary content with the access token.
      res = await fetchWithTimeout(
        'https://www.googleapis.com/drive/v3/files/' +
          encodeURIComponent(entry.id) + '?alt=media',
        { headers: { 'Authorization': 'Bearer ' + accessToken } },
        8000
      );
    }

    if (!res.ok) {
      console.error(
        'Image fetch error (' + res.status + ') for: ' + (entry.name || entry.url)
      );
      return null;
    }

    // Convert binary response to base64 in fixed-size chunks to avoid
    // call-stack overflow on large images (same safe pattern as other Workers).
    const arrayBuffer = await res.arrayBuffer();
    const bytes       = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    const mimeType = entry.mimeType || 'image/jpeg';
    return {
      dataUri: 'data:' + mimeType + ';base64,' + btoa(binary),
      mimeType,
    };

  } catch (err) {
    console.error('Image fetch exception for "' + (entry.name || entry.url) + '":', err);
    return null;
  }
}


// =============================================================================
// HTML PAGE BUILDERS
// =============================================================================

// Builds the rendered text message page. Typography scales proportionally to
// the layout dimensions so the content is legible across all four layout sizes.
// The "Daily Safety Message" label and divider are only shown in the full layout
// because the wide, split, and tri layouts have a built-in title bar provided
// by the display system — including the label there would be redundant.
// String concatenation is used throughout (no template literals) to prevent
// smart-quote corruption when the file is edited in GitHub's browser editor.
function buildTextPage(entry, layout, layoutKey, refreshSeconds, darkBg) {
  const { width, height } = layout;
  const showLabel = (layoutKey === 'full');

  // Calculate font sizes and spacing proportionally to layout dimensions.
  const messageFontSize     = Math.floor(Math.min(width, height) * 0.048); // Message font size as a % of the smaller of height or width dimensions (1080*.048 = 51px font size)
  const attributionFontSize = Math.floor(messageFontSize * 0.58); // Attribution label font size as a % of the message font size
  const labelFontSize       = Math.floor(messageFontSize * 0.68); // Title font size as a % of the message font size
  const dividerWidth        = Math.floor(width  * 0.10);
  const paddingV            = Math.floor(height * 0.07);
  const paddingH            = Math.floor(width  * 0.08);
  const gapBelow            = Math.floor(height * 0.045);

  const content     = escapeHtml(entry.content);
  const attribution = escapeHtml(entry.attribution);

  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta http-equiv="refresh" content="' + refreshSeconds + '">' +
    '<meta name="viewport" content="width=' + width + ', height=' + height + '">' +
    '<title>Daily Message</title>' +
    '<style>' +
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +
    'html, body {' +
    '  width: ' + width + 'px;' +
    '  height: ' + height + 'px;' +
    '  overflow: hidden;' +
    '  background: ' + (darkBg || layoutKey === 'full' ? DARK_BG_COLOR : 'transparent') + ';' +
    '  color: ' + TEXT_PRIMARY + ';' +
    '  display: flex;' +
    '  align-items: center;' +
    '  justify-content: center;' +
    '}' +
    '.container {' +
    '  width: 100%;' +
    '  max-width: ' + (width - paddingH * 2) + 'px;' +
    '  padding: ' + paddingV + 'px ' + paddingH + 'px;' +
    '  text-align: center;' +
    '}' +
    '.label {' +
    '  font-family: ' + FONT_STACK + ';' +
    '  font-size: ' + labelFontSize + 'px;' +
    '  font-weight: 700;' +
    '  letter-spacing: 0.28em;' +
    '  text-transform: uppercase;' +
    '  color: ' + TEXT_SECONDARY + ';' +
    '  margin-bottom: ' + Math.floor(gapBelow * 0.7) + 'px;' +
    '}' +
    '.divider {' +
    '  width: ' + dividerWidth + 'px;' +
    '  height: 2px;' +
    '  margin: 0 auto ' + gapBelow + 'px;' +
    '  background: linear-gradient(to right, transparent, ' + ACCENT_COLOR + ', transparent);' +
    '}' +
    '.message {' +
    '  font-family: Georgia, "Times New Roman", serif;' +
    '  font-size: ' + messageFontSize + 'px;' +
    '  font-style: italic;' +
    '  line-height: 1.65;' +
    '  color: ' + TEXT_PRIMARY + ';' +
    '}' +
    '.attribution {' +
    '  margin-top: ' + gapBelow + 'px;' +
    '  font-family: ' + FONT_STACK + ';' +
    '  font-size: ' + attributionFontSize + 'px;' +
    '  color: ' + TEXT_SECONDARY + ';' +
    '  letter-spacing: 0.07em;' +
    '}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="container">' +
    (showLabel ? '<div class="label">Daily Safety Message</div>' : '') +
    (showLabel ? '<div class="divider"></div>' : '') +
    '<div class="message">' + content + '</div>' +
    (attribution
      ? '<div class="attribution">&mdash;&nbsp;' + attribution + '</div>'
      : '') +
    '</div>' +
    '</body>' +
    '</html>'
  );
}

// Builds the image display page. The image is centered and constrained to the
// layout dimensions with dark letterboxing if the image aspect ratio differs.
function buildImagePage(imageData, layout, refreshSeconds, darkBg) {
  const { width, height } = layout;

  return (
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta http-equiv="refresh" content="' + refreshSeconds + '">' +
    '<meta name="viewport" content="width=' + width + ', height=' + height + '">' +
    '<title>Daily Message</title>' +
    '<style>' +
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +
    'html, body {' +
    '  width: ' + width + 'px;' +
    '  height: ' + height + 'px;' +
    '  overflow: hidden;' +
    '  background: ' + (darkBg ? DARK_BG_COLOR : 'transparent') + ';' +
    '  display: flex;' +
    '  align-items: center;' +
    '  justify-content: center;' +
    '}' +
    'img {' +
    '  display: block;' +
    '  max-width: ' + width + 'px;' +
    '  max-height: ' + height + 'px;' +
    '  width: 100%;' +
    '  height: 100%;' +
    '  object-fit: contain;' +
    '}' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<img src="' + imageData.dataUri + '" alt="Daily message">' +
    '</body>' +
    '</html>'
  );
}

// Builds the error/retry page. Displays a minimal message on the dark
// background and auto-retries after ERROR_RETRY_SECONDS.
function renderErrorPage(title, subtitle, layout, darkBg) {
  const { width, height } = layout;
  const titleFont = Math.floor(Math.min(width, height) * 0.030);
  const subFont   = Math.floor(Math.min(width, height) * 0.020);

  return new Response(
    '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<meta http-equiv="refresh" content="' + ERROR_RETRY_SECONDS + '">' +
    '<title>Daily Message</title>' +
    '<style>' +
    '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }' +
    'html, body {' +
    '  width: ' + width + 'px;' +
    '  height: ' + height + 'px;' +
    '  overflow: hidden;' +
    '  background: ' + (darkBg ? DARK_BG_COLOR : 'transparent') + ';' +
    '  font-family: ' + FONT_STACK + ';' +
    '  display: flex; align-items: center; justify-content: center;' +
    '}' +
    '.err-wrap { display: flex; flex-direction: column; align-items: center; gap: ' + Math.floor(subFont * 0.6) + 'px; text-align: center; padding: 0 ' + Math.floor(width * 0.08) + 'px; }' +
    '.err-title { font-size: ' + titleFont + 'px; font-weight: 700; color: ' + ACCENT_COLOR + '; letter-spacing: 0.06em; }' +
    '.err-sub   { font-size: ' + subFont   + 'px; color: ' + TEXT_PRIMARY + '; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    '<div class="err-wrap">' +
    '<div class="err-title">' + escapeHtml(title)    + '</div>' +
    '<div class="err-sub">'   + escapeHtml(subtitle) + '</div>' +
    '</div>' +
    '</body>' +
    '</html>',
    {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    }
  );
}
