# Grabbit 🐰: Free Web Scraper & Data Extractor

Turn any website into a spreadsheet in one click. Free, private, no code, no account.

- **Auto-detects** lists, grids and tables, and keeps real table headers
- **Point-and-click picker**: click one item and Grabbit selects all similar ones
- **Multi-page**: follows "Next" buttons and infinite scroll
- **Bulk URLs**: paste a list or load a CSV and Grabbit scrapes every page
- **Emails & contacts**: emails, phones and social profiles, plus each site's contact/about pages
- **Scheduled scraping**: re-scrape hourly, daily or weekly in the background, count new rows, optional auto-download
- **Image downloader**: save every image in the data to `Downloads/grabbit/<site>-<date>/`
- **Quick grab**: all links, all images, page text
- **Editor**: rename/delete columns, edit cells, dedupe
- **Saved recipes** per website
- **Export**: Excel (.xlsx), CSV, JSON, clipboard, Google Sheets
- Side panel UI, `Alt+G` shortcut, dark mode, zero dependencies, nothing leaves the browser

## Install (development)
1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** and select this folder

## Test
Needs Node and Playwright with Chromium.
```bash
node test/e2e.js
```
This loads the real extension and checks auto-detect, the picker, pagination, infinite scroll, contacts, table headers, bulk URLs, image downloads, schedules and exports against the pages in `test/fixtures/`. `node test/screenshots.js` regenerates the store images.

## Package for the Chrome Web Store
```bash
./build.sh
```
This creates `dist/grabbit-<version>.zip`. Upload it in the Developer Dashboard. The listing text, privacy answers and image assets are in [`store/`](store/LISTING.md).

## Files
| File | Purpose |
| --- | --- |
| `manifest.json` | MV3 manifest with minimal permissions |
| `background.js` | Opens the side panel for the clicked tab; runs scheduled scrapes |
| `scrape.js` | Shared helpers: page bridge, pagination loop |
| `content.js` | Page engine: detection, picker, extraction, pagination, contacts |
| `panel.*` | Side panel UI |
| `export.js` | CSV / TSV / JSON / dependency-free XLSX writer |
| `welcome.html` | First-run onboarding |
