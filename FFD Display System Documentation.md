# Fire Station Display Board — System Documentation

*Technical Reference Guide for Department Staff, Administrators, and IT Support*

Last Updated: April 4, 2026

Maintained by: Brandon Wehner


# Table of Contents

- [1. System Overview](#1-system-overview)
  - [1.1 Purpose](#11-purpose)
  - [1.2 How the System Works](#12-how-the-system-works)
  - [1.3 Technology Stack](#13-technology-stack)
- [2. Account & Access Guide](#2-account--access-guide)
  - [2.1 Accounts and Where to Find Them](#21-accounts-and-where-to-find-them)
  - [2.2 GitHub Repositories](#22-github-repositories)
  - [2.3 GitHub Secrets Reference](#23-github-secrets-reference)
  - [2.4 Transferring Ownership to a New Administrator](#24-transferring-ownership-to-a-new-administrator)
- [3. Project: Image Resizing Proxy](#3-project-image-resizing-proxy)
- [4. Project: Slide Timing Proxy](#4-project-slide-timing-proxy)
- [5. Project: River Level Display](#5-project-river-level-display)
- [6. Project: Daily Message Display](#6-project-daily-message-display)
- [7. Project: Calendar Display](#7-project-calendar-display)
- [8. Deployment & Maintenance Workflow](#8-deployment--maintenance-workflow)
- [9. IT Support Reference](#9-it-support-reference)
- [10. Planned Enhancements](#10-planned-enhancements)

# 1. System Overview

## 1.1 Purpose

The Fire Station Display Board system is a set of digital display screens deployed throughout the fire station that provide firefighters with real-time and regularly updated operational information. Content displayed includes traffic camera feeds, river gauge levels and hydrographs, Google Slides presentations with department announcements, and other data relevant to daily operations.

The system was designed with two core constraints in mind:

- Display screens can only be configured with a single, static endpoint URL — no runtime parameters or user interaction is possible at the screen level.

- All infrastructure and tooling used must be free or within free tier service limits.

## 1.2 How the System Works

Because the display screens cannot resize images, authenticate to APIs, or make intelligent decisions at runtime, a layer of Cloudflare Workers sits between the screens and the data sources. Each Worker is a lightweight serverless function that runs at Cloudflare's edge network and handles the logic that the display screen cannot.

The general data flow for every display is:

| **Step**             | **Description**                                             |
|----------------------|-------------------------------------------------------------|
| Display Screen       | Loads a single, fixed Cloudflare Worker URL                 |
| Cloudflare Worker    | Processes the request, fetches data from external sources   |
| External Data Source | Returns camera images, river gauge data, slide counts, etc. |
| Response to Screen   | Worker returns the processed content ready for display      |

Each Worker is deployed independently and has its own URL. A display screen is configured with a Worker URL and from that point on requires no further maintenance unless the underlying data source or configuration changes.

## 1.3 Technology Stack

| **Technology**     | **Purpose**                                           | **Cost**                    |
|--------------------|-------------------------------------------------------|-----------------------------|
| Cloudflare Workers | Serverless edge functions that process requests       | Free tier (100,000 req/day) |
| GitHub             | Source code storage and version control               | Free                        |
| GitHub Actions     | Automatic deployment pipeline to Cloudflare           | Free                        |
| images.weserv.nl   | Image resizing and format conversion                  | Free                        |
| NOAA NWPS API      | River gauge data (stage, flood thresholds, forecasts) | Free / Public               |
| ND DOT / USGS      | Traffic camera and river camera image sources         | Free / Public               |

# 2. Account & Access Guide

## 2.1 Accounts and Where to Find Them

| **Account**  | **URL / Login**                                | **What It Controls**                                     |
|--------------|------------------------------------------------|----------------------------------------------------------|
| Cloudflare   | dash.cloudflare.com – bwehner                  | Worker deployment, subdomain (bwehner), secrets storage  |
| GitHub       | github.com/wehnerb                             | All source code repositories and deployment workflows    |
| Google Cloud | console.cloud.google.com — bwehner@fargond.gov | Google Slides API access and service account credentials |

## 2.2 GitHub Repositories

| **Repository**        | **Worker URL**                            | **Purpose**                                               |
|-----------------------|-------------------------------------------|-----------------------------------------------------------|
| station-image-proxy   | station-image-proxy.bwehner.workers.dev   | Image resizing and caching proxy for traffic camera feeds |
| slide-timing-proxy    | slide-timing-proxy.bwehner.workers.dev    | Dynamic Google Slides per-slide timing                    |
| river-level-display   | river-level-display.bwehner.workers.dev   | River gauge hydrograph display (NOAA NWPS data)           |
| daily-message-display | daily-message-display.bwehner.workers.dev | Daily safety message and image display                    |
| calendar-display      | calendar-display.bwehner.workers.dev      | Station calendar display from exported ICS file           |

## 2.3 GitHub Secrets Reference

Each GitHub repository stores secrets that are injected into the Cloudflare Worker at deployment time. These are never exposed in code and must be set per repository under Settings → Secrets and variables → Actions.

| **Secret Name**              | **Repository**             | **Description**                                                                                                                                                                                               |
|------------------------------|----------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CLOUDFLARE_API_TOKEN         | All three                  | Cloudflare API token with Workers edit permissions                                                                                                                                                            |
| CLOUDFLARE_ACCOUNT_ID        | All three                  | Cloudflare account ID (found on any zone page in dashboard)                                                                                                                                                   |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | slide-timing-proxy only    | Service account email from Google Cloud JSON key file                                                                                                                                                         |
| GOOGLE_PRIVATE_KEY           | slide-timing-proxy only    | Private key from Google Cloud JSON key file (include \n characters)                                                                                                                                           |
| GOOGLE_SHEET_ID              | daily-message-display only | The ID of the Google Sheet containing daily messages. Found in the Sheet URL between /d/ and /edit.                                                                                                           |
| GOOGLE_DRIVE_FOLDER_ID       | daily-message-display only | The ID of the Google Drive folder containing daily message images for daily-message-display. Found in the folder URL after /folders/.                                                                         |
| PRESENTATION_ID              | slide-timing-proxy only    | Google Slides presentation ID — the alphanumeric string between /d/ and /edit in the presentation URL. Stored as a Worker secret, not hardcoded in source.                                                    |
| PUBLISHED_ID                 | slide-timing-proxy only    | Google Slides published embed ID — the long string between /d/e/ and /pubembed in the File → Share → Publish to web embed URL. Stored as a Worker secret, not hardcoded in source.                            |
| NEXTCLOUD_URL                | calendar-display only      | Full WebDAV URL to the ICS file on Nextcloud. Format: https://fileshare.fargond.gov/remote.php/dav/files/USERNAME/FFD%20Calendar%20Export/FFD%20Calendar%20Calendar.ics                                       |
| NEXTCLOUD_USERNAME           | calendar-display only      | Nextcloud login username (shown when creating an app password — not the display name).                                                                                                                        |
| NEXTCLOUD_PASSWORD           | calendar-display only      | Nextcloud app password. Generate at: Nextcloud → Settings → Security → Devices & sessions → Create new app password. Use an app password rather than the account password so it can be revoked independently. |

| **Where to Find These Secret Values**                                                                                                                                                                                                                                                                                                                                                                                                                              |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| CLOUDFLARE_API_TOKEN: Log in to dash.cloudflare.com, go to My Profile → API Tokens → Create Token. Use the "Edit Cloudflare Workers" template. Copy the generated token — it is only shown once.                                                                                                                                                                                                                                                                   |
| CLOUDFLARE_ACCOUNT_ID: Log in to dash.cloudflare.com and go to Workers & Pages → Overview. The Account ID is displayed in the right sidebar.                                                                                                                                                                                                                                                                                                                       |
| GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY: Log in to console.cloud.google.com and open the slide-timing project. Go to IAM & Admin → Service Accounts → slide-timing-worker → Keys → Add Key → Create new key (JSON). Download the JSON file. The client_email field is your GOOGLE_SERVICE_ACCOUNT_EMAIL and the private_key field is your GOOGLE_PRIVATE_KEY. Store the JSON file securely and delete it after copying the values into GitHub Secrets. |
| Note: river-level-display does not require any Google credentials — the NOAA NWPS API is fully public. daily-message-display uses the same service account as slide-timing-proxy — no additional Google credentials are needed beyond CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN. calendar-display uses Nextcloud WebDAV and does not require any Google credentials.                                                                                          |

| **Important — Cloudflare Worker Secrets**                                                                                                                                                                                                                                                      |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| After the first deployment of a new Worker environment (e.g. staging), the secrets must also be verified in the Cloudflare dashboard under Workers & Pages → \[Worker Name\] → Settings → Variables and Secrets. If secrets are missing, they can be added manually there without redeploying. |

## 2.4 Transferring Ownership to a New Administrator

If a new person takes over maintenance of this system, the following steps must be completed to transfer full control. Each step must be completed in order.

### Step 1 — GitHub

1.  Create a GitHub account for the new administrator if they do not have one.

2.  Go to github.com/wehnerb and transfer ownership of each repository to the new account under Settings → Danger Zone → Transfer ownership. Alternatively, add the new person as an owner of the organization.

3.  The new administrator must re-add all GitHub Secrets listed in Section 2.3 to each repository under their account.

### Step 2 — Cloudflare

1.  Log in to dash.cloudflare.com and go to Manage Account → Members.

2.  Add the new administrator's email and assign the Administrator role.

3.  Create a new API token for the new administrator using the Edit Cloudflare Workers template and provide it to them for their GitHub secrets.


### Step 3 — Google Cloud

1.  Go to console.cloud.google.com and open the slide-timing project.

2.  Go to IAM & Admin → IAM and add the new administrator's Google account with the Owner role.

3.  The new administrator should create a new service account key (IAM & Admin → Service Accounts → slide-timing-worker → Keys → Add Key). The old key should then be deleted.

4.  Update GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in GitHub Secrets with the new values.

*Note: river-level-display has no Google Cloud dependency. daily-message-display reuses the existing slide-timing-proxy service account — no additional Google Cloud steps are needed for that Worker during a transfer. The new administrator must share the daily-message-display Google Sheet and Drive folder with the service account email after completing Step 3. calendar-display uses Nextcloud WebDAV and has no Google Cloud dependency — the new administrator only needs to update the NEXTCLOUD_URL, NEXTCLOUD_USERNAME, and NEXTCLOUD_PASSWORD secrets in Cloudflare and GitHub.*

# 3. Project: Image Resizing Proxy

## 3.1 Purpose & Problem Solved

The station display system cannot resize images natively. Without intervention, images either fail to fill a display column entirely or overflow beyond its boundaries. A further complication arose when multiple station displays began requesting the same images simultaneously from images.weserv.nl (a free image resizing service), resulting in rate limiting that caused images to stop loading.

The Image Resizing Proxy Worker solves both problems:

- It resizes images to exact pixel dimensions for each layout type before serving them to the display.

- It caches the resized images on a configurable schedule, so all display screens receive cached responses rather than generating new upstream requests on every load.

## 3.2 Repository & Deployment

| **Item**          | **Value**                                                |
|-------------------|----------------------------------------------------------|
| GitHub Repository | github.com/wehnerb/station-image-proxy                   |
| Production URL    | https://station-image-proxy.bwehner.workers.dev/         |
| Staging URL       | https://station-image-proxy-staging.bwehner.workers.dev/ |
| Worker File       | worker_code.js                                           |
| Secrets Required  | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID              |

## 3.3 How It Works

When a display screen loads an image URL, the request goes to the Cloudflare Worker. The Worker reads the URL parameters to determine which image to fetch, what size to produce, and how aggressively to cache it. It then fetches the image through images.weserv.nl with the correct dimensions and returns the result to the display. Cloudflare caches the response so that subsequent requests within the refresh window are served without any upstream calls.

A CACHE_VERSION constant is maintained in the code. Incrementing this value forces all cached images to expire immediately, which is useful if the image mapping or layout dimensions are changed.

## 3.4 URL Parameters

| **Parameter** | **Default** | **Options**          | **Description**                                                                               |
|---------------|-------------|----------------------|-----------------------------------------------------------------------------------------------|
| img           | (required)  | Any key from MAPPING | The image key name to display. Combine two keys with + for stacking.                          |
| layout        | split       | wide, split, tri     | Column width: 1-column (wide), 2-column (split), 3-column (tri). Default is split (2-column). |
| refresh       | fast        | fast, moderate, slow | Cache refresh interval: fast = 5 min, moderate = 20 min, slow = 1 hour.                       |


## 3.5 Layout Dimensions

| **Layout Key** | **Width (px)** | **Height (px)** | **Use Case**                     |
|----------------|----------------|-----------------|----------------------------------|
| wide           | 1735           | 720             | Full-width single column display |
| split          | 852            | 720             | Two-column display (default)     |
| tri            | 558            | 720             | Three-column display             |
| full           | 1920           | 1075            | Full-screen display              |

## 3.6 Example URLs

Single camera image in a two-column layout, refreshing every 5 minutes (all defaults):

`https://station-image-proxy.bwehner.workers.dev/?img=i29MainAve-north`
Two stacked camera images in a two-column layout, refreshing every 20 minutes:

`https://station-image-proxy.bwehner.workers.dev/?img=i29MainAve-north+i29MainAve-south&layout=split&refresh=moderate`
River level gauge in a single-column layout, refreshing every hour:

`https://station-image-proxy.bwehner.workers.dev/?img=riverlevel-redriver&layout=wide&refresh=slow`
## 3.7 Image Stacking

Two images can be stacked vertically within a single column by separating two image keys with a + in the img parameter. The Worker automatically splits the column height equally between the two images with a 10-pixel gap between them. A maximum of 2 images can be stacked. Attempting to stack 3 or more will return an error image.

## 3.8 Adding New Images

All images are defined in the MAPPING object near the top of worker_code.js. To add a new camera or data image:

1.  Open the staging branch of the station-image-proxy repository in GitHub.

2.  Edit worker_code.js and locate the MAPPING object.

3.  Add a new line inside the MAPPING object following the existing format:

`"your-key-name": "https://full-url-to-the-source-image.jpg",`

4.  Key names should be lowercase with hyphens — for example i29MainAve-north for an I-29 camera at Main Ave facing north.

5.  Commit the change to staging and test the new key using the staging Worker URL before merging to main.

## 3.9 Current Image Library

The following images are currently configured in the MAPPING object. See Section 3.8 for instructions on adding new images.

### NOAA River Gauges

| **Key Name**        | **Readable Name**            | **Source URL**                                            |
|---------------------|------------------------------|-----------------------------------------------------------|
| riverlevel-redriver | Red River Level Gauge (NOAA) | https://water.noaa.gov/resources/hydrographs/fgon8_hg.png |


### USGS River Images

| **Key Name**   | **Readable Name**                | **Source URL**                                                                                                                     |
|----------------|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------|
| river-redriver | Red River at Fargo (USGS Camera) | https://usgs-nims-images.s3.amazonaws.com/overlay/ND_Red_River_of_the_North_at_Fargo/ND_Red_River_of_the_North_at_Fargo_newest.jpg |

### ND DOT Cameras — I-94

| **Key Name**          | **Readable Name**                     | **Source URL**                                                                   |
|-----------------------|---------------------------------------|----------------------------------------------------------------------------------|
| i94VeteransBlvd-south | I-94 at Veterans Blvd (Facing South)  | https://www.dot.nd.gov/travel-info/cameras/I94@347.601Fargo9thStEWBSouth.jpg     |
| i94VeteransBlvd-east  | I-94 at Veterans Blvd (Facing East)   | https://www.dot.nd.gov/travel-info/cameras/I94RP347.565Fargo9thStEEBEast.jpg     |
| i9445thStS-south      | I-94 at 45th St S (Facing South)      | https://www.dot.nd.gov/travel-info/cameras/I94RP348.602Fargo45thStSouth.jpg      |
| i9445thStS-east       | I-94 at 45th St S (Facing East)       | https://www.dot.nd.gov/travel-info/cameras/I94RP348.602Fargo45thStEast.jpg       |
| i9445thStS-west       | I-94 at 45th St S (Facing West)       | https://www.dot.nd.gov/travel-info/cameras/I94RP348.602Fargo45thStWest.jpg       |
| i9442ndStS-east       | I-94 at 42nd St S (Facing East)       | https://www.dot.nd.gov/travel-info/cameras/I94RP349.145Fargo42ndStSWBEast.jpg    |
| i9442ndStS-west       | I-94 at 42nd St S (Facing West)       | https://www.dot.nd.gov/travel-info/cameras/I94RP349.145Fargo42ndStSWBWest.jpg    |
| i29i94-north          | I-29/I-94 Interchange (Facing North)  | https://www.dot.nd.gov/travel-info/cameras/fargotrilevelnorth.jpg                |
| i29i94-south          | I-29/I-94 Interchange (Facing South)  | https://www.dot.nd.gov/travel-info/cameras/fargotrilevelsouth.jpg                |
| i94i29-east           | I-94/I-29 Interchange (Facing East)   | https://www.dot.nd.gov/travel-info/cameras/fargotrileveleast.jpg                 |
| i94i29-west           | I-94/I-29 Interchange (Facing West)   | https://www.dot.nd.gov/travel-info/cameras/fargotrilevelwest.jpg                 |
| i9425thStS-east       | I-94 at 25th St S (Facing East)       | https://www.dot.nd.gov/travel-info/cameras/I94RP350.611Fargo25thStEast.jpg       |
| i9425thStS-west       | I-94 at 25th St S (Facing West)       | https://www.dot.nd.gov/travel-info/cameras/I94RP350.603Fargo25thStWest.jpg       |
| i94UniversityDrS-east | I-94 at University Dr S (Facing East) | https://www.dot.nd.gov/travel-info/cameras/I94RP351.617FargoUniversityDrEast.jpg |
| i94UniversityDrS-west | I-94 at University Dr S (Facing West) | https://www.dot.nd.gov/travel-info/cameras/I94RP351.617FargoUniversityDrWest.jpg |
| i94RedRiver-east      | I-94 at Red River (Facing East)       | https://www.dot.nd.gov/travel-info/cameras/I94RP352FargoRedRiverEast.jpg         |
| i94RedRiver-west      | I-94 at Red River (Facing West)       | https://www.dot.nd.gov/travel-info/cameras/I94RP352FargoRedRiverWest.jpg         |

### ND DOT Cameras — I-29

| **Key Name**      | **Readable Name**                 | **Source URL**                                                                       |
|-------------------|-----------------------------------|--------------------------------------------------------------------------------------|
| i2970thAveS-north | I-29 at 70th Ave S (Facing North) | https://www.dot.nd.gov/travel-info/cameras/I29RP58.765FargoSouthof64thAveSNorth.jpg  |
| i2970thAveS-south | I-29 at 70th Ave S (Facing South) | https://www.dot.nd.gov/travel-info/cameras/I29RP58.765FargoSouthof64thAveSSouth.jpg  |
| i2952ndAveS-north | I-29 at 52nd Ave S (Facing North) | https://www.dot.nd.gov/travel-info/cameras/I29RP60.293Fargo52ndAveSSBNorth.jpg       |
| i2952ndAveS-south | I-29 at 52nd Ave S (Facing South) | https://www.dot.nd.gov/travel-info/cameras/I29RP60.293Fargo52ndAveSSBSouth.jpg       |
| i2952ndAveS-east  | I-29 at 52nd Ave S (Facing East)  | https://www.dot.nd.gov/travel-info/cameras/I29RP60.293Fargo52ndAveSSBEast.jpg        |
| i2952ndAveS-west  | I-29 at 52nd Ave S (Facing West)  | https://www.dot.nd.gov/travel-info/cameras/I29RP60.293Fargo52ndAveSSBWest.jpg        |
| i2940thAveS-north | I-29 at 40th Ave S (Facing North) | https://www.dot.nd.gov/travel-info/cameras/I29RP61.408Fargo40thAveNorth.jpg          |
| i2940thAveS-south | I-29 at 40th Ave S (Facing South) | https://www.dot.nd.gov/travel-info/cameras/I29RP61.408Fargo40thAveSouth.jpg          |
| i2932ndAveS-north | I-29 at 32nd Ave S (Facing North) | https://www.dot.nd.gov/travel-info/cameras/I29RP62.627Fargo32ndAveSEastRampNorth.jpg |
| i2932ndAveS-south | I-29 at 32nd Ave S (Facing South) | https://www.dot.nd.gov/travel-info/cameras/I29RP62.627Fargo32ndAveSEastRampSouth.jpg |
| i2932ndAveS-west  | I-29 at 32nd Ave S (Facing West)  | https://www.dot.nd.gov/travel-info/cameras/I29RP62.627Fargo32ndAveSEastRampWest.jpg  |
| i2913thAveS-north | I-29 at 13th Ave S (Facing North) | https://www.dot.nd.gov/travel-info/cameras/I29RP64.725FargoNorthof9thAveNorth.jpg    |
| i2913thAveS-south | I-29 at 13th Ave S (Facing South) | https://www.dot.nd.gov/travel-info/cameras/I29RP64.135Fargo13thAveSSouth.jpg         |
| i29MainAve-north  | I-29 at Main Ave (Facing North)   | https://www.dot.nd.gov/travel-info/cameras/I29RP65.272FargoMainAveSBNorth.jpg        |
| i29MainAve-south  | I-29 at Main Ave (Facing South)   | https://www.dot.nd.gov/travel-info/cameras/I29RP65.272FargoMainAveSBSouth.jpg        |
| i297thAveN-south  | I-29 at 7th Ave N (Facing South)  | https://www.dot.nd.gov/travel-info/cameras/I29RP65.741Fargo7thAveNSouth.jpg          |
| i2919thAveN-north | I-29 at 19th Ave N (Facing North) | https://www.dot.nd.gov/travel-info/cameras/I29RP66.894Fargo19thAveNNorth.jpg         |
| i2919thAveN-south | I-29 at 19th Ave N (Facing South) | https://www.dot.nd.gov/travel-info/cameras/I29RP66.894Fargo19thAveNSouth.jpg         |
| i2919thAveN-east  | I-29 at 19th Ave N (Facing East)  | https://www.dot.nd.gov/travel-info/cameras/I29RP67.241Fargo19thAveNEastRampEast.jpg  |
| i2919thAveN-west  | I-29 at 19th Ave N (Facing West)  | https://www.dot.nd.gov/travel-info/cameras/I29RP67.241Fargo19thAveNEastRampWest.jpg  |

# 4. Project: Slide Timing Proxy

## 4.1 Purpose & Problem Solved

Display screens are configured with a fixed time slot for showing a Google Slides presentation — for example, 60 seconds. However, the number of slides in the presentation changes over time. If the presentation has 6 slides and each is displayed for 10 seconds, the full 60 seconds is used. If there are only 2 slides but each is still set to 10 seconds, only 20 of the 60 seconds is used before it loops.

The Slide Timing Proxy Worker solves this by dynamically calculating the correct per-slide timing at request time. Each time the display loads the Worker URL, the Worker queries the Google Slides API to count the current number of slides, divides the total allotted time equally, and redirects the display directly to the Google Slides published embed URL with the correct timing parameter already set.

## 4.2 Repository & Deployment

| **Item**          | **Value**                                                                                     |
|-------------------|-----------------------------------------------------------------------------------------------|
| GitHub Repository | github.com/wehnerb/slide-timing-proxy                                                         |
| Production URL    | https://slide-timing-proxy.bwehner.workers.dev/                                               |
| Staging URL       | https://slide-timing-proxy-staging.bwehner.workers.dev/                                       |
| Worker File       | src/index.js                                                                                  |
| Secrets Required  | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY |

## 4.3 URL Parameters

| **Parameter** | **Required** | **Description**                                                                             |
|---------------|--------------|---------------------------------------------------------------------------------------------|
| screens       | Recommended  | Removed. No URL parameters are required. The Worker URL is used as-is with no query string. |

### Example URL

All stations use the same Worker URL with no additional parameters:

`https://slide-timing-proxy.bwehner.workers.dev/`
## 4.4 How It Works

1.  The Worker authenticates with the Google Slides API using a service account, generating a short-lived OAuth2 access token using the RSA-signed JWT method via Cloudflare’s built-in Web Crypto API.

2.  The Worker checks the Workers Cache API for a previously stored slide count. If a cached value exists and the SLIDE_CACHE_VERSION matches, the cached count is used and the Google API is not called.

3.  On a cache miss, the Worker calls the Slides API to retrieve the current number of slides and stores the result in the cache for SLIDE_CACHE_SECONDS (default 1 hour).

4.  The per-slide delay is calculated: total seconds divided by slide count, clamped to the configured minimum.

5.  The Worker issues a 302 redirect directly to the Google Slides published embed URL (pubembed format) with the calculated delayms parameter. The presentation always starts from slide 1 on every fresh load.

## 4.5 Timing Logic

| **Slide Count** | **Total Seconds** | **Per-Slide Delay** | **Notes**                                         |
|-----------------|-------------------|---------------------|---------------------------------------------------|
| 0               | 60                | N/A                 | No-content screen shown, auto-refreshes every 60s |
| 1               | 60                | 60s                 | Single slide uses full allotted time              |
| 2               | 60                | 30s                 | Normal equal division                             |
| 6               | 60                | 10s                 | Normal equal division                             |
| 12              | 60                | 5s                  | Hits minimum cap (MIN_SECONDS = 5)                |
| API fails       | 60                | 60s                 | Safe fallback: slideCount defaults to 1           |

## 4.6 Configuration

The top of src/index.js contains all values that may need to be changed. No other part of the file should need editing for normal operation. The only values that ever need to be adjusted are TOTAL_SECONDS, MIN_SECONDS, SLIDE_CACHE_SECONDS, and SLIDE_CACHE_VERSION.

| **Constant**                     | **Description**                                                                                                                                                                                                                                                                                                                                                                                                  |
|----------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| PRESENTATION_ID and PUBLISHED_ID | These values are stored as Cloudflare Worker secrets (set in the Cloudflare dashboard under Workers & Pages → \[Worker Name\] → Settings → Variables and Secrets) and injected at runtime via the env object. PRESENTATION_ID is the alphanumeric ID between /d/ and /edit in the Google Slides URL. PUBLISHED_ID is the long string between /d/e/ and /pubembed in the File → Share → Publish to web embed URL. |
| TOTAL_SECONDS                    | Total seconds the display system allocates to the slideshow slot. The Worker divides this equally across all slides. This must match the number of seconds the display is set to show the slide show                                                                                                                                                                                                             |
| MIN_SECONDS                      | Minimum seconds per slide regardless of how many slides exist. Prevents slides from being too brief to read.                                                                                                                                                                                                                                                                                                     |
| SLIDE_CACHE_SECONDS              | How long (seconds) the slide count is cached using the Workers Cache API. During this window the Google Slides API is called at most once regardless of request volume. Default is 3600 (1 hour). Suitable when slide count changes infrequently.                                                                                                                                                                |
| SLIDE_CACHE_VERSION              | Integer cache-buster. Increment by 1 to immediately invalidate the cached slide count and force a fresh Google API call on the next request. Use this when the slide count changes and displays need to pick up new timing without waiting for SLIDE_CACHE_SECONDS to expire.                                                                                                                                    |


## 4.7 No-Content Screen

If the presentation has zero slides, the Worker returns a styled HTML page instead of redirecting. This page displays a dark blue screen with the message NO CONTENT AVAILABLE. The page automatically refreshes every 60 seconds so the display will recover automatically as soon as slides are added to the presentation.

## 4.8 Google Service Account

The Google Slides API no longer accepts simple API keys for reading presentation data. Authentication requires a service account — a non-human Google account that belongs to the Google Cloud project rather than to an individual person. The service account credentials are stored as GitHub secrets and injected into the Worker at deployment time.

The service account only has read-only access to the Slides API scope. It does not have access to any Google Drive files, Google accounts, or any other Google services.

| **Security Note**                                                                                                                                                                                                                                                                                                                                     |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| The service account private key (GOOGLE_PRIVATE_KEY) is a sensitive credential. It is stored only in GitHub Secrets and Cloudflare Worker secrets — never in the code itself. If a key is ever suspected to be compromised, it should be deleted in Google Cloud Console (IAM & Admin → Service Accounts → Keys) and a new one generated immediately. |

# 5. Project: River Level Display

## 5.1 Purpose & Problem Solved

Static NOAA river gauge images (used via the Image Resizing Proxy) show only a current stage and a basic hydrograph image. They cannot be customized for display resolution, do not show forecast data in a readable way at station screen sizes, and do not highlight flood threshold proximity relative to current conditions.

The River Level Display Worker solves this by fetching raw gauge data from the NOAA NWPS public API and rendering a fully custom, canvas-based hydrograph HTML page server-side. The page is tailored to the exact pixel dimensions of each station display layout and includes features not available in the static image:

- 120 hours of observed stage history with a gradient fill

- NWS forecast data displayed as a dashed line

- Flood threshold lines (action/minor/moderate/major) shown only when within range

- A crest marker when the river has peaked and is confirmed falling

- An adaptive X-axis that adjusts label density based on available width

- A real-time flood status badge in the header (Normal / Action / Minor / Moderate / Major)

- Auto-refresh every 15 minutes matching the NOAA data update cycle

## 5.2 Repository & Deployment

| **Item**          | **Value**                                                |
|-------------------|----------------------------------------------------------|
| GitHub Repository | github.com/wehnerb/river-level-display                   |
| Production URL    | https://river-level-display.bwehner.workers.dev/         |
| Staging URL       | https://river-level-display-staging.bwehner.workers.dev/ |
| Worker File       | src/index.js                                             |
| Secrets Required  | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID              |

## 5.3 URL Parameters

| **Parameter** | **Default** | **Options**                  | **Description**                                                         |
|---------------|-------------|------------------------------|-------------------------------------------------------------------------|
| gauge         | fargo       | Any key from GAUGES registry | Which river gauge to display. See Section 5.7 for the current registry. |
| layout        | split       | wide, split, tri, full       | Column width matching display hardware. See Section 5.4 for dimensions. |

### Example URLs

Red River gauge in a two-column layout (all defaults):

`https://river-level-display.bwehner.workers.dev/`
Red River gauge in a three-column layout:

`https://river-level-display.bwehner.workers.dev/?layout=tri`
Red River gauge in a full-screen layout:

`https://river-level-display.bwehner.workers.dev/?layout=full`

## 5.4 Layout Dimensions

Dimensions match the station-image-proxy project exactly and should not be changed unless the display hardware changes.

| **Layout Key** | **Width (px)** | **Height (px)** | **Use Case**                     |
|----------------|----------------|-----------------|----------------------------------|
| wide           | 1735           | 720             | Full-width single column display |
| split          | 852            | 720             | Two-column display (default)     |
| tri            | 558            | 720             | Three-column display             |
| full           | 1920           | 1075            | Full-screen display              |

## 5.5 How It Works

When a display screen loads the Worker URL, the following sequence occurs:

1.  The Worker makes two parallel requests to the NOAA NWPS public API: one for gauge metadata (name, flood thresholds) and one for observed and forecast stage data. No authentication is required.

2.  The Worker processes the response: it trims observed history to the configured window (120 hours), combines observed and forecast data, detects a crest if the river has peaked and is confirmed falling, and determines the current flood status.

3.  All processed data is injected as a JSON literal into a self-contained HTML page. No further API calls are made by the display browser.

4.  The browser renders the hydrograph on a canvas element using the injected data. Font sizes, chart margins, and axis label density adapt automatically to the selected layout dimensions.

5.  The page auto-refreshes every 15 minutes via a meta refresh tag, matching the NOAA data update cycle.

If the NOAA API is unreachable or returns an error, the Worker returns a styled error page that automatically retries every 60 seconds.

## 5.6 Configuration

The top of src/index.js contains all values that may need to be changed. No other part of the file should need editing for routine operation.

```javascript
const GAUGES = {

'fargo': { id: 'FGON8', name: 'Red River at Fargo' },

};

const DEFAULT_GAUGE = 'fargo';

const OBSERVED_HOURS = 72;

const CACHE_SECONDS = 900;

const Y_AXIS_PADDING = 1.5;

const THRESHOLD_LOOKAHEAD_FT = 3.0;

const CREST_MIN_FLANK_POINTS = 4;

const CREST_MIN_PROMINENCE_FT = 0.5;
```
| **Constant**            | **Description**                                                                                                                                                                               |
|-------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| GAUGES                  | Registry mapping URL-friendly keys to NOAA gauge IDs and display names. Add new gauges here (see Section 5.7).                                                                                |
| DEFAULT_GAUGE           | The gauge used when the ?gauge= parameter is omitted from the URL.                                                                                                                            |
| OBSERVED_HOURS          | How many hours of observed history to show on the chart (default: 120).                                                                                                                       |
| CACHE_SECONDS           | How long Cloudflare caches the Worker response in seconds (default: 900 = 15 minutes). NOAA updates data every 30 minutes so 15 minutes provides fresh data without excessive upstream calls. |
| Y_AXIS_PADDING          | Feet of padding added above and below the data range on the Y axis to keep data points off chart edges.                                                                                       |
| THRESHOLD_LOOKAHEAD_FT  | A flood threshold line is only shown when it falls within this many feet of the data maximum. Keeps the chart uncluttered when the river is well below flood stage.                           |
| CREST_MIN_FLANK_POINTS  | Number of data points required on each side of the peak before a crest is confirmed. At NOAA's 30-min interval, 4 points represents ~2 hours of trend on each side.                           |
| CREST_MIN_PROMINENCE_FT | The peak must be at least this many feet above the average of the flanking data to be labeled as a crest. Prevents noise or flat conditions from being labeled.                               |

## 5.7 Adding New Gauges

All gauges are defined in the GAUGES object near the top of src/index.js. To add a new gauge:

1.  Find the NOAA gauge ID for the location. Go to water.noaa.gov, search for the gauge location, and find the four- to five-character identifier in the URL (for example, FGON8 for Fargo, ND).

2.  Open the staging branch of the river-level-display repository in GitHub.

3.  Edit src/index.js and locate the GAUGES object.

4.  Add a new line following the existing format:

`'your-key': { id: 'NWSID', name: 'Human-readable name' },`

5.  Commit the change to staging and test using the staging Worker URL with ?gauge=your-key before merging to main.

## 5.8 Current Gauge Registry

| **Key (?gauge=)** | **NOAA Gauge ID** | **Display Name**   | **Notes**                                   |
|-------------------|-------------------|--------------------|---------------------------------------------|
| fargo             | FGON8             | Red River at Fargo | Default gauge — no ?gauge= parameter needed |


## 5.9 Chart Features Reference

| **Feature**        | **Description**                                                                                                                                                                                                |
|--------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Observed line      | Solid blue line showing the last 72 hours of recorded stage readings with a gradient fill beneath                                                                                                              |
| Forecast line      | Dashed amber line showing the NWS official forecast, displayed when forecast data is available from NOAA                                                                                                       |
| Flood thresholds   | Horizontal dashed lines for Action, Minor, Moderate, and Major flood stages. Only displayed when within 3 ft of the chart's data maximum to avoid cluttering a chart when the river is well below flood        |
| Crest marker       | Diamond marker with a dashed vertical line and label box showing the crest stage and time, displayed when the river has peaked and the descent is confirmed by at least 4 data points on each side of the peak |
| NOW marker         | Vertical dashed line marking the current time on the chart                                                                                                                                                     |
| Flood status badge | Color-coded badge in the header showing current status: Normal (green), Action (yellow), Minor (orange), Moderate (red), Major (dark red)                                                                      |
| Legend             | Automatically repositioned in the top-right of the chart area to avoid overlapping threshold lines                                                                                                             |
| Auto-refresh       | Page reloads every 15 minutes to pick up new NOAA data                                                                                                                                                         |
| Error recovery     | If the NOAA API is unavailable, an error page is displayed that retries every 60 seconds                                                                                                                       |

# 6. Project: Daily Message Display

## 6.1 Purpose & Problem Solved

Station displays previously had no mechanism for showing rotating safety messages, quotes, or imagery. The Daily Message Display Worker provides a dedicated full-screen display that rotates content every 3 days — aligned to the department’s 9-day shift rotation — ensuring all three shifts see every message before it advances. Content is managed by shift officers without any technical knowledge required.

## 6.2 Repository & Deployment

| **Item**          | **Value**                                                                                                                              |
|-------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| GitHub Repository | github.com/wehnerb/daily-message-display                                                                                               |
| Production URL    | https://daily-message-display.bwehner.workers.dev/                                                                                     |
| Staging URL       | https://daily-message-display-staging.bwehner.workers.dev/                                                                             |
| Worker File       | src/index.js                                                                                                                           |
| Secrets Required  | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID, GOOGLE_DRIVE_FOLDER_ID |

## 6.3 URL Parameters

Full-screen default (no parameter needed):

https://daily-message-display.bwehner.workers.dev/

Two-column split layout:

https://daily-message-display.bwehner.workers.dev/?layout=split

The ?layout= parameter accepts: full (1920x1080, default), wide (1735x720), split (852x720), tri (558x720). The Daily Safety Message title label is only shown in the full layout.

## 6.4 How It Works

1\. The Worker authenticates with Google using the shared service account (same account as slide-timing-proxy), generating a short-lived OAuth2 access token.

2\. The Worker fetches the Messages tab from Google Sheets and lists image files in the Google Drive folder in parallel.

3\. Date override entries are checked first. If today’s date matches a pinned image filename prefix or a sheet row’s Date column, that entry is selected. Images take priority over text if both are pinned to the same date.

4\. If no date override matches, a combined rotation pool is built by interleaving active text entries and image files evenly. The pool index is: floor(daysElapsed / ROTATION_DAYS) % poolSize, anchored to January 23, 2026 in America/Chicago time.

5\. For image entries, the Worker fetches the image from Drive server-side and encodes it as a base64 data URI. The display browser never contacts Google directly.

6\. A self-contained HTML page is returned. The meta-refresh interval is set to the exact seconds until the next 7:30 AM Central rotation, limiting Worker invocations to approximately one per station per day.


## 6.5 Rotation Logic

Messages rotate every ROTATION_DAYS calendar days (default: 3). With 3-day blocks aligned to the 9-day shift rotation, each message is seen by all three shifts before advancing. Day boundaries use America/Chicago time via Intl.DateTimeFormat, so DST transitions are handled correctly. To change frequency, update ROTATION_DAYS in src/index.js (minimum: 1 day).

## 6.6 Configuration

The top of src/index.js contains all values that may need to be changed. Key constants: ROTATION_DAYS (default 3), ROTATION_ANCHOR (2026-01-23), IMAGE_SOURCE (“drive” or “network”), DEFAULT_LAYOUT (“full”). No other part of the file should need editing for routine operation.

## 6.7 Content Management

**Text messages:** Add rows to the Messages tab of the Google Sheet “Fire Station Display — Daily Messages”. Set Active to “yes”. Date and Attribution are optional. See the sheet’s Instructions tab for full guidance.

**Images:** Drop image files into the “Fire Station Display — Daily Images” Drive folder. Optimize to under 5 MB before uploading. Move files into any subfolder to deactivate.

**Date pinning:** For text, enter YYYY-MM-DD in the Date column. For images, prefix the filename: YYYY-MM-DD-filename.jpg. Images win if both sources are pinned to the same date.

## 6.8 Google Sheet Columns

Columns are read by header name so they can be reordered without code changes. Required columns: Content, Active. Optional columns: Date, Attribution. The header row is protected with an edit warning.

## 6.9 Network Share (Future Use)

The Worker includes a stubbed code path for an internal network share. To activate: set IMAGE_SOURCE = “network” in src/index.js and add secrets NETWORK_SHARE_URL (required), NETWORK_SHARE_USERNAME and NETWORK_SHARE_PASSWORD (optional, for authenticated shares) to both Cloudflare Worker settings and deploy.yml. See src/index.js comments for full setup details.

# 7. Project: Calendar Display

## 7.1 Purpose & Problem Solved

The station display system did not previously have a way to display the department's calendar or current weather conditions. The Calendar Display Worker fetches the FFD Calendar ICS file from Nextcloud via WebDAV and renders it as a styled HTML calendar page. For wide and full layouts, the Worker also fetches live NWS weather data — daily high/low temperatures, conditions, and wind for each day, an hourly forecast strip for today, and active/upcoming weather alert banners and badges. No technical knowledge is required to keep the calendar current.

## 7.2 Repository & Deployment

| **Item**          | **Value**                                                                                          |
|-------------------|----------------------------------------------------------------------------------------------------|
| GitHub Repository | github.com/wehnerb/calendar-display                                                                |
| Production URL    | https://calendar-display.bwehner.workers.dev/                                                      |
| Staging URL       | https://calendar-display-staging.bwehner.workers.dev/                                              |
| Worker File       | src/index.js                                                                                       |
| Secrets Required  | CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, NEXTCLOUD_URL, NEXTCLOUD_USERNAME, NEXTCLOUD_PASSWORD |

## 7.3 URL Parameters

The ?layout= parameter controls which design is rendered. wide and full use the split view (today detail on the left, next 4 days on the right) and include NWS weather data. split and tri use the strip view (compact upcoming list) with no weather data. The FFD Calendar title label is only shown in the full layout. Default is wide.

Example URLs: https://calendar-display.bwehner.workers.dev/?layout=wide \| https://calendar-display.bwehner.workers.dev/?layout=full \| https://calendar-display.bwehner.workers.dev/?layout=split \| https://calendar-display.bwehner.workers.dev/?layout=tri

## 7.4 How It Works

1\. The Worker checks the Workers Cache API for a previously rendered page matching the requested layout. If a valid cached response exists it is returned immediately — no further requests are made.

2\. On a cache miss, data is fetched. For split and tri layouts, only the ICS file is fetched from Nextcloud via WebDAV. For wide and full layouts, the ICS file and all three NWS endpoints (daily forecast, hourly forecast, active alerts) are fetched in parallel using Promise.all to minimize total latency. Each NWS fetch fails gracefully — if weather data is unavailable, the calendar renders without it rather than returning an error.

3\. The raw ICS text is fetched server-side from Nextcloud using HTTP Basic authentication with a Nextcloud app password. The display browser never contacts Nextcloud directly. Windows timezone names emitted by Exchange (e.g. "Central Standard Time") are automatically mapped to IANA timezone identifiers.

4\. Filter rules are applied, a self-contained HTML page is rendered, stored in the Workers Cache API for CACHE_SECONDS (default 15 minutes), and returned to the display.


## 7.5 Automatic Calendar Update System

The calendar is kept current by a three-component system that runs automatically at login on the designated department computer. No manual steps are required during normal operation.

- Outlook VBA macro (ThisOutlookSession in the Outlook VBA editor): Runs automatically when Outlook opens. Exports the next 30 days of the FFD Calendar public folder (Public Folders \> Fire \> FFD Calendar) to U:\Fire\BWehner\FFD Calendar Export\FFD Calendar Calendar.ics. The export includes yesterday so that all-day events starting at midnight are not missed if the export runs later in the day.

- Nextcloud desktop app: Syncs the FFD Calendar Export folder to Nextcloud automatically. No configuration is required as long as the Nextcloud desktop app is installed and the FFD Calendar Export folder is inside the Nextcloud sync path. The file is typically synced within a few seconds of the macro writing it.

- No Task Scheduler task is required. The Nextcloud desktop app handles syncing passively whenever the ICS file changes.

Full setup instructions for rebuilding this system on a new computer are in U:\Fire\BWehner\FFD Calendar Export\FFD Calendar Export Setup.txt. A backup of the Outlook VBA macro is at U:\Fire\BWehner\FFD Calendar Export\VbaProject.OTM. Note: rclone.exe and rclone.conf in that folder are no longer needed and can be deleted.

## 7.6 Configuration

The top of src/index.js contains all values that may need to be changed. Calendar constants: DAYS_TO_SHOW (default 6), CACHE_SECONDS (default 900 = 15 minutes), CACHE_VERSION (increment to bust all cached pages immediately — useful after any configuration change affecting the rendered output), FILTER_EXACT (event titles excluded by exact match), FILTER_CONTAINS (event titles excluded by substring match), ALLDAY_COLORS (custom banner colors per event title). NWS weather constants: NWS_OFFICE (FGF), NWS_GRID_X (65), NWS_GRID_Y (57), NWS_ALERT_ZONE (NDZ039 — Cass County ND), WEATHER_HOUR_INTERVAL (hours between hourly strip slots, default 2), WEATHER_STRIP_WIDTH (px width of hourly strip, default 75), WEATHER_ICON_SIZE (px size of SVG icons in hourly strip, default 18), NWS_FORECAST_CACHE_SECONDS (edge cache TTL for forecast data, default 3600 = 1 hour), NWS_ALERTS_CACHE_SECONDS (edge cache TTL for alert data, default 900 = 15 minutes). NWS_USER_AGENT is set as a plain \[vars\] entry in wrangler.toml (not a secret) and identifies the Worker to the NWS API. See the repository README for the full configuration table.

## 7.7 NWS Weather Display (wide / full layouts)

Weather data is fetched from the National Weather Service public API (api.weather.gov) with no API key required. NWS_USER_AGENT is sent in request headers as required by the NWS API terms of service. All NWS fetches are edge-cached separately from the page cache: forecasts for NWS_FORECAST_CACHE_SECONDS (default 1 hour) and alerts for NWS_ALERTS_CACHE_SECONDS (default 15 minutes).

Daily forecast: Every column header — including today — shows the high temperature (orange), low temperature (blue), a condition dot and short forecast text, and the wind direction and speed range. A small color-coded dot precedes the condition text as a quick visual category cue: yellow for sun/clear, soft yellow for partly cloudy, amber for thunderstorm, light blue for snow, blue-purple for wintry mix/sleet/freezing precipitation, bright blue for rain/drizzle, and gray-blue for cloudy/fog/wind/default.

Hourly forecast strip: The left side of the today panel body shows remaining hours of today at WEATHER_HOUR_INTERVAL intervals. Each slot shows the hour label (NOW, 2 PM, etc.), temperature, and an inline SVG weather icon. SVG icons are used instead of emoji to ensure correct rendering on display hardware that may lack an emoji font. The slot count is automatically capped to prevent overflow.

Alert banners: Active NWS alerts for Cass County (NDZ039) appear as full-width colored banners above the calendar panels, sorted by severity. Red = Extreme/Severe (Warning), Orange = Moderate (Watch), Yellow = Minor (Advisory). Each banner shows the alert name and when it ends. The end time is taken from the ends field (actual weather event end) rather than the expires field (when NWS will issue the next product update), so displayed times match what other weather services show. Banners disappear automatically after the next cache refresh once the alert expires.

Alert badges: Upcoming alerts not yet active appear as severity-colored pills in the affected day's column header. Multi-day alerts appear in every overlapping day's header. All headers render the same number of badge rows (real + invisible placeholders) so header heights stay uniform across all columns. The CSS grid row auto-sizing ensures all headers always match the height of the tallest header regardless of weather content.

## 7.8 Event Filtering & All-Day Colors

Two filter arrays control which events are hidden. FILTER_EXACT requires the event title to match the filter string exactly (case-insensitive) and is used for titles that could appear as substrings of legitimate event names. FILTER_CONTAINS hides any event whose title contains the string anywhere. To temporarily disable a filter without deleting it, add // to the beginning of the line.

All-day events are rendered as colored banners at the top of each day. The ALLDAY_COLORS map assigns custom background, border, and text colors per event title (case-insensitive exact match). Current shift colors: A Shift = dark green, B Shift = off-white with dark text, C Shift = dark red. Events not in the map use the default blue banner style.

## 7.9 Manual Calendar Update

To update the calendar outside of a normal login, open Outlook, open the VBA editor (Developer tab \> Visual Basic), click anywhere inside Application_Startup, and press F5. The Nextcloud desktop app will sync the updated file automatically within a few seconds. No PowerShell command or manual upload is required.

The Worker caches pages for 15 minutes. To force an immediate cache refresh after a manual upload, increment CACHE_VERSION in src/index.js by 1, deploy to staging, test, and merge to main.

# 8. Deployment & Maintenance Workflow

## 8.1 Branch Strategy

Each repository uses two branches. All changes must go through staging before being merged to main. This applies to all four Worker projects.

| **Branch** | **Deploys To**                         | **Purpose**                                          |
|------------|----------------------------------------|------------------------------------------------------|
| staging    | \[worker\]-staging.bwehner.workers.dev | Testing and validation of changes before production  |
| main       | \[worker\].bwehner.workers.dev         | Live production environment used by station displays |

## 8.2 Making a Code Change

Follow these steps in order for all code changes. Do not skip directly to main without completing the staging test steps.

1.  Switch to the staging branch in the GitHub repository.

2.  Edit the relevant file(s) using the GitHub browser editor.

3.  Commit directly to the staging branch.

4.  GitHub Actions will automatically deploy the change to the staging Worker within about 30–45 seconds.

5.  Test the staging Worker URL in a browser to confirm the change works as expected.

6.  For display-dependent changes (image layouts, timing, chart rendering, or any change that affects how content appears on screen), also temporarily update the endpoint URL on a single station display to the staging Worker URL. Confirm the change works correctly on actual display hardware before proceeding.

7.  Once both browser and display tests pass, create a Pull Request from staging → main in GitHub, or merge directly via the branch interface.

8.  GitHub Actions will automatically deploy to the production Worker within about 30–45 seconds.

9.  Verify the production Worker URL is functioning correctly. If you temporarily changed a display to the staging URL for testing, return it to the production URL now.

### Rolling Back a Change

If a change causes problems and needs to be undone:

- Simple rollback (staging only): If the change was small and easy to reverse, open the file in the staging branch in GitHub, edit it to restore the previous value, and commit.

- Commit history rollback (staging): For more complex changes, go to the staging branch in GitHub, click the commit history, find the target commit, click the "\<\>" (Browse repository at this point) button, and use Revert.

- Production rollback: Go to the main branch commit history in GitHub, find the last known-good commit, and use GitHub's Revert feature to create a new revert commit. This triggers a redeployment automatically.

- Re-sync branches after rollback: After reverting main, merge main back into staging immediately to keep both branches in sync.

| **Important**                                                                                                                                                                                              |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Never deploy directly to main without first testing in staging. If a deployment fails, the previous version remains live — Cloudflare does not replace the running Worker until a new deployment succeeds. |

| **Important — X-Frame-Options Header**                                                                                                                                                                                                                                                                                                                                                                                                               |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| The X-Frame-Options: SAMEORIGIN header must never be added to any of these Workers. All Workers are loaded as full-screen iframes by the display system, and this header causes the browser to block the page from rendering entirely, producing an immediate white error screen. This was discovered during security hardening in March 2026. The Referrer-Policy and X-Content-Type-Options headers are safe and are present in all three Workers. |

## 8.3 Monitoring Deployments

Every deployment is logged in the Actions tab of the GitHub repository. Each workflow run shows whether it succeeded or failed and provides a full log of each step. If a deployment fails, the previous version remains live — Cloudflare does not replace the running Worker until a new deployment succeeds.

# 9. IT Support Reference

## 9.1 Overview for IT Staff

This system runs entirely on external cloud services and does not require any on-premises server infrastructure, VPNs, or internal network changes. The display screens require only outbound internet access to reach the Cloudflare Worker URLs. There is no software to install, no servers to patch, and no internal ports to open.

IT involvement would typically only be needed for:

- Network connectivity issues at the station that prevent displays from reaching external URLs.

- Display hardware or operating system issues at the screen level.

- Account access issues if the department member managing this system is unavailable.

## 9.2 Network Requirements

The display screens must have outbound internet access on port 443 (HTTPS) to the following domains:

- \*.workers.dev — Cloudflare Worker endpoints (all five projects)

- docs.google.com — Google Slides embeds (the display browser follows a redirect to load the presentation directly)

api.weather.gov — NWS weather data for the calendar-display Worker (fetched by the Worker on Cloudflare's network, not by the display screens directly)

No other external domains need to be reachable from the display screens. All upstream fetching (traffic camera images, river gauge data, image resizing, NOAA API calls) is handled by the Cloudflare Workers on Cloudflare's network — those requests do not originate from the station displays themselves.

## 9.3 Troubleshooting

| **Symptom**                                       | **Likely Cause**                                       | **Resolution**                                                                                                                                                                                                          |
|---------------------------------------------------|--------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Display shows blank/white screen                  | Network connectivity or display hardware issue         | Check internet connectivity at the screen. Verify the Worker URL loads in a browser on the same network.                                                                                                                |
| Images show CAMERA KEY NOT FOUND error            | Invalid image key in the URL                           | Check the img parameter in the display URL against the MAPPING list in worker_code.js (Section 3.9).                                                                                                                    |
| Images show IMAGE UNAVAILABLE                     | Source camera or data feed is offline                  | Check the source URL directly. This is typically a third-party outage outside department control.                                                                                                                       |
| River gauge shows error page                      | NOAA API temporarily unavailable                       | The page retries automatically every 60 seconds. Typically self-resolves. Check api.water.noaa.gov directly if persistent.                                                                                              |
| River gauge data is stale                         | Cloudflare cache not yet expired                       | Data refreshes every 15 minutes. Wait for the next cache cycle or check the NOAA website directly.                                                                                                                      |
| Slides cycling at wrong speed                     | Slide count API call failing or secrets missing        | Check Cloudflare Worker logs (Workers & Pages → \[Worker Name\] → Logs). Verify GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are present under Settings → Variables and Secrets.                                 |
| GitHub Actions deployment fails                   | Invalid secret or API token expiry                     | Check the Actions log for error details. Re-create the failing secret in GitHub and re-run the workflow.                                                                                                                |
| Calendar shows weather alerts with wrong end time | NWS updated the alert expiry after the page was cached | The page cache TTL is 15 minutes (CACHE_SECONDS). The alert end time will correct itself within 15 minutes. The Worker uses the ends field (actual event end) rather than expires (product expiry) for displayed times. |
| Calendar shows no weather data                    | NWS API temporarily unavailable or rate-limited        | The calendar renders without weather rather than showing an error. Typically self-resolves. Check api.weather.gov directly if persistent.                                                                               |


## 9.4 Service Limits & Monitoring

All services operate within their free tiers. The current usage is well within the limits below. If displays begin showing errors consistently across all screens simultaneously, checking these limits is a useful diagnostic step.

| **Service**                              | **Free Tier Limit**                                                      | **Est. Daily Usage (8 stations)**                                                                                               | **Where to Check**                                     |
|------------------------------------------|--------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------|
| Cloudflare Workers (image proxy)         | 100,000 req/day                                                          | ~15,500–22,000 req/day                                                                                                          | dash.cloudflare.com → Workers & Pages → Overview       |
| Cloudflare Workers (slide timing)        | 100,000 req/day                                                          | ~2,300–3,300 req/day                                                                                                            | dash.cloudflare.com → Workers & Pages → Overview       |
| Cloudflare Workers (river level display) | 100,000 req/day                                                          | ~700–1,000 req/day (15-min cache reduces Worker invocations significantly)                                                      | dash.cloudflare.com → Workers & Pages → Overview       |
| Cloudflare Workers (combined total)      | 100,000 req/day                                                          | ~18,500–26,300 req/day (~19–26% of limit, not including daily-message-display or calendar-display which each add ~8–16 req/day) | dash.cloudflare.com → Workers & Pages → Overview       |
| Google Slides API                        | 300 req/minute                                                           | At most 1 request per hour per cache version — well within limit due to Workers Cache API slide count caching                   | console.cloud.google.com → APIs & Services → Dashboard |
| NOAA NWPS API                            | No documented hard limit; public API                                     | Low — all responses cached for 15 min by Cloudflare                                                                             | Monitor via gauge display on screens                   |
| images.weserv.nl                         | No documented hard limit; rate limiting applies to direct repeated calls | N/A — all calls routed through Worker cache                                                                                     | Monitor via image load success on displays             |

| **Usage Estimates**                                                                                                                                                                                                                                                                                                                                  |
|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| The figures above are worst-case estimates based on all 8 stations online with a 3.5–5 minute display cycle and no shared URL caching between stations. Actual usage is likely lower because Cloudflare edge caching serves repeated requests for the same URL without invoking the Worker, reducing both Worker invocations and upstream API calls. |

## 9.5 Contact & Escalation

For issues with application code, configuration, or Cloudflare/GitHub accounts, contact Brandon Wehner.

For issues with display screen hardware or operating system, contact the shift personnel responsible for the station alerting and communications system. They will serve as the initial point of contact for department personnel and will escalate to the display vendor as needed.

For local network connectivity issues preventing displays from reaching external URLs, contact the City of Fargo Information Services (IS) Department.

# 10. Planned Enhancements

The following enhancements are under consideration for future development. Priority ratings reflect potential operational value relative to implementation effort.

## 10.1 Incident & Performance Data (First Due)

These enhancements depend on API access to First Due. The availability, structure, and rate limits of that API have not yet been fully evaluated.

| **Enhancement**                    | **Description**                                                                                                                                   | **Priority** | **Status**          |
|------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------|--------------|---------------------|
| Turnout Time Display               | Graphical display showing the percentage of calls where the crew met the department's turnout time benchmark as defined by the Standard of Cover. | High         | Under Consideration |
| Turnout Time Trending              | Graphical representation showing turnout time trends over time, making performance direction visible at a glance.                                 | High         | Under Consideration |
| Incident Type by Final Disposition | Graphical breakdown of incident types using final report disposition rather than dispatched type.                                                 | High         | Under Consideration |
| Time-of-Day Call Distribution      | Chart showing when calls are most frequent throughout the day.                                                                                    | Medium       | Under Consideration |
| Year-over-Year Call Volume         | Comparison of call volume across years to identify growth trends.                                                                                 | Medium       | Under Consideration |
| Geographic Call Clustering         | Heat map or cluster map showing where calls are concentrated within the response area.                                                            | Low          | Under Consideration |

## 10.2 Display Content Enhancements

| **Enhancement**                           | **Description**                                                                                                                                                                                                                          | **Priority** | **Status**          |
|-------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|---------------------|
| Daily Safety Message Display              | Daily messages, quotes, and images displayed on station screens, rotating every 3 days to ensure all shifts see each message.                                                                                                            | Medium       | Complete            |
| Calendar Display                          | Station calendar showing FFD Calendar public folder in a split or strip layout. Exported from Outlook automatically at login via VBA macro, synced to Nextcloud via the Nextcloud desktop app, fetched by the Worker via WebDAV.         | Medium       | Complete            |
| NOAA Weather Alerts                       | Active and upcoming NWS weather alerts displayed on the calendar screen with severity-colored banners (active) and column header badges (upcoming). Daily forecast, hourly strip, and SVG weather icons also added to wide/full layouts. | Medium       | Complete            |
| Birthday & Department Anniversary Display | Display birthdays and department hire anniversaries for the current week or month.                                                                                                                                                       | Low          | Under Consideration |
| Retirement Countdown                      | Countdown display for upcoming retirements (with member permission).                                                                                                                                                                     | Low          | Under Consideration |
| Additional River Gauges                   | Add additional NOAA gauge locations to the river-level-display GAUGES registry (e.g., Moorhead, MN — gauge MHDN8).                                                                                                                       | Low          | Under Consideration |
