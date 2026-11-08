# Chrome Web Store submission guide: Grabbit 1.3.2

Follow the Developer Dashboard top to bottom and copy each field below.
Dashboard: https://chrome.google.com/webstore/devconsole

---

## 0. Before you start
1. Create a developer account. There is a one-time $5 registration fee.
2. Turn on GitHub Pages once: repo **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick the branch, folder **/docs**, then **Save**. Within a minute or two:
   - Privacy policy: https://adityarungta2048.github.io/Grabbit/privacy.html
   - Homepage: https://adityarungta2048.github.io/Grabbit/
3. Click **New item** and upload `grabbit-1.3.2.zip` (build it with `./build.sh`).

---

## 1. Package
Upload `dist/grabbit-1.3.2.zip`.

---

## 2. Store listing tab

### Product details

**Title** (filled in from the manifest):
```
Grabbit – Free Web Scraper & Data Extractor
```

**Summary** (filled in from the manifest, 132 characters max):
```
Scrape any website to Excel, CSV, JSON or Google Sheets in one click. Free, no code, no account. Lists, tables, emails, pages.
```

**Description:**
```
Grabbit turns any website into a clean spreadsheet in seconds. It's free, needs no account, and your data never leaves your browser.

Open Grabbit on a page and it finds the lists and tables for you: products, search results, listings, directories, leads, jobs, reviews, prices. Check the preview, then export to Excel, CSV, JSON or Google Sheets.

★ WHY GRABBIT
• 100% free. No credits, no row limits, no "upgrade to export"
• No sign-up, no account, no API key
• Private by design: everything runs locally in your browser, nothing is uploaded
• Works without code: no selectors, XPath or setup
• Few permissions: Grabbit only reads the tab you open it on, and asks before doing more

★ FEATURES
✔ One-click auto-detect: finds lists, grids and tables on any page
✔ Point-and-click picker: click one item and Grabbit selects all the similar ones
✔ Multi-page scraping: follows "Next" buttons and pagination for you
✔ Infinite scroll: keeps scrolling and collects every item
✔ Bulk URL scraper: paste hundreds of URLs or load a CSV, and Grabbit visits each one
✔ Scheduled scraping: re-scrape a page every hour, day or week and see how many rows are new. Great for price, stock and job tracking. Can auto-download Excel or CSV after each run
✔ Bulk image downloader: save every image in your data to a folder in one click
✔ Email extractor: finds emails, phone numbers and social profiles (LinkedIn, X/Twitter, Facebook, Instagram, YouTube, TikTok, GitHub), and also checks each site's contact and about pages
✔ Link extractor, image extractor and page text extractor
✔ Real table headers: HTML tables keep their column names
✔ Built-in editor: rename columns, delete columns, edit cells, remove duplicates
✔ Saved recipes: save a setup per website and reuse it in one click
✔ Export to Excel (.xlsx), CSV, JSON, clipboard, or straight into Google Sheets
✔ Side panel UI that stays open while you browse
✔ Keyboard shortcut: Alt+G
✔ Dark mode

★ GREAT FOR
• Lead generation: collect emails and contacts from business directories
• E-commerce: product names, prices, ratings and images, plus scheduled price monitoring and competitor tracking
• Real estate, jobs and marketplace listings
• SEO: all links, headings and page text
• Research and journalism: turn HTML tables into spreadsheets
• Recruiting: candidate and company lists
• Marketing: influencer and social profile lists

★ HOW IT WORKS
1. Open any website and click the Grabbit icon (or press Alt+G)
2. Grabbit highlights the data it found. Use ‹ › to switch lists, or "Pick on page"
3. Optional: turn on "Multiple pages" to scrape every page, or schedule it to run automatically
4. Click Excel, CSV, JSON or Sheets. Done!

★ PRIVACY
Grabbit has no servers. It doesn't collect, store or sell any data. Scraped data stays on your computer until you export it.

Please scrape responsibly and respect each website's terms of service.

Questions or ideas? Leave a review. We read every one.
```

**Category:** `Tools` (under Productivity)

**Language:** `English`

### Graphic assets
| Field | File | Size |
| --- | --- | --- |
| Store icon * | `icons/128.png` | 128×128 |
| Global promo video | *(optional)* a 30–60 s YouTube screen recording of scraping a page, exporting to Excel, then a schedule. Listings with a video convert better. | — |
| Screenshot 1 * | `store/screenshot-1.jpg`: "Scrape any website in one click" | 1280×800 |
| Screenshot 2 | `store/screenshot-2.jpg`: "Every page, automatically" | 1280×800 |
| Screenshot 3 | `store/screenshot-3.jpg`: "Find emails, phones & social profiles" | 1280×800 |
| Screenshot 4 | `store/screenshot-4.jpg`: "Scrape hundreds of URLs at once" | 1280×800 |
| Screenshot 5 | `store/screenshot-5.jpg`: "Track prices & stock on autopilot" | 1280×800 |
| Small promo tile | `store/promo-small.jpg` | 440×280 |
| Marquee promo tile | `store/promo-marquee.jpg` | 1400×560 |

The screenshots and tiles are JPEGs with no alpha, as the store requires. Upload the screenshots in the order above: the first one appears in search results. To regenerate them, run `node test/screenshots.js`.

### Additional fields
- **Official URL:** *(optional)* only a site you've verified in Search Console
- **Homepage URL:** `https://adityarungta2048.github.io/Grabbit/`
- **Support URL:** `https://github.com/AdityaRungta2048/Grabbit/issues`
- **Mature content:** No

---

## 2b. Localized listings (12 more languages)
The title and summary are translated inside the package (`_locales/`), so the store shows them automatically after you upload 1.3.2. The description and images are added per language:

1. **Store listing** tab → the language dropdown at the top → **Add language** (or pick it).
2. Paste the description from the language's `.md` file.
3. Under **Graphic assets** for that language, upload the localized images from the language's folder: `screenshot-1.jpg` … `screenshot-5.jpg` (in order), `promo-small.jpg` and `promo-marquee.jpg`. The store icon is shared, so don't re-upload it. They show the side panel and captions in that language.

| Language | Dashboard name | Description | Images folder |
| --- | --- | --- | --- |
| Spanish | Spanish | `store/locales/es.md` | `store/locales/es/` |
| Portuguese (Brazil) | Portuguese (Brazil) | `store/locales/pt_BR.md` | `store/locales/pt_BR/` |
| French | French | `store/locales/fr.md` | `store/locales/fr/` |
| German | German | `store/locales/de.md` | `store/locales/de/` |
| Italian | Italian | `store/locales/it.md` | `store/locales/it/` |
| Russian | Russian | `store/locales/ru.md` | `store/locales/ru/` |
| Japanese | Japanese | `store/locales/ja.md` | `store/locales/ja/` |
| Korean | Korean | `store/locales/ko.md` | `store/locales/ko/` |
| Chinese (Simplified) | Chinese (China) | `store/locales/zh_CN.md` | `store/locales/zh_CN/` |
| Hindi | Hindi | `store/locales/hi.md` | `store/locales/hi/` |
| Indonesian | Indonesian | `store/locales/id.md` | `store/locales/id/` |
| Turkish | Turkish | `store/locales/tr.md` | `store/locales/tr/` |

The extension's own interface (side panel, on-page picker, welcome page) is translated into the same 13 languages and follows the browser language, so the button names in each description match what users see.

---

## 3. Privacy tab

**Single purpose description:**
```
Grabbit extracts data that the user chooses from web pages (lists, tables, contact details, links and images) and exports it to spreadsheet files such as Excel, CSV and JSON.
```

**Permission justifications** (paste one into each box):

| Permission | Justification |
| --- | --- |
| `activeTab` | Reads the page the user opens Grabbit on, so it can detect and extract the lists, tables or contact details the user asked for. |
| `scripting` | Injects Grabbit's extraction script into that page when the user opens Grabbit or starts a scrape. Nothing is injected on other pages. |
| `sidePanel` | Shows Grabbit's interface in Chrome's side panel next to the page the user is scraping. |
| `storage` | Saves the user's per-site recipes, schedules, the latest scheduled results and settings locally on the device. |
| `alarms` | Runs the scrapes the user scheduled (hourly, daily or weekly) at the times the user picked. |
| `downloads` (optional) | Asked for only when the user clicks "Images" to save scraped images, or turns on auto-download for a schedule, to save those files to the Downloads folder. |
| Host permissions (optional, `<all_urls>`) | Asked for at runtime only when the user starts multi-page, bulk URL or scheduled scraping. For multi-page and schedules, only the current site is requested. For bulk scraping, it lets Grabbit open and read the URLs the user pasted. |

**Are you using remote code?** `No, I am not using remote code`

**Data usage:** tick **no** data types. Grabbit collects nothing.
Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** `https://adityarungta2048.github.io/Grabbit/privacy.html`

---

## 4. Distribution tab
- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

Then click **Submit for review**. A first review usually takes a few days. Optional permissions and a clear justification for each one help it pass faster.

---

## Keywords this listing targets
web scraper, data scraper, data extractor, scrape to excel, website to excel, scrape to google sheets, csv export, table scraper, list scraper, email extractor, email scraper, lead extractor, contact finder, pagination scraper, infinite scroll scraper, bulk url scraper, scheduled scraper, price tracker, price monitor, image downloader, bulk image downloader, no code scraper, free web scraper, instant data scraper, link extractor

## Launch tips for more installs
1. Once the store approves Grabbit, point the "Get Grabbit for Chrome" button in `docs/index.html` at the store page. Listings with a website rank better, and the site sends visitors to the store.
2. Add a short YouTube demo as the promo video.
3. Early ratings matter most. The panel asks for a review after a user's 3rd export, and you can also share the review link with your first users.
4. Post a short demo GIF on Product Hunt, Reddit (r/webscraping, r/chrome_extensions, r/sales, r/leadgeneration, r/datasets, r/ecommerce), and in LinkedIn/X growth communities.
5. Localize the listing (Spanish, Portuguese, French, German, Hindi, Japanese) in the dashboard. Each translated listing ranks in that locale's search.
6. Ship small updates often and mention them in the description. Recently updated extensions get more trust.
