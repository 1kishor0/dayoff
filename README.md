# Weekly Day-Off Selection – Nordlich Consulting GmbH

Free stack:
- **Website** → GitHub Pages (free hosting)
- **Backend + database** → Google Sheets + Google Apps Script (free)
- **Excel export** → admin page, one click

```
dayoff-site/
├── index.html                 Employee page (warehouse → ID → days + reason)
├── admin.html / admin.js      Admin page (password, filter, Download Excel)
├── app.js                     Employee page logic
├── style.css                  Styles
├── config.js                  Your backend URL goes here
└── google-apps-script/Code.gs Backend (IDs, password, rules) – NOT used by GitHub
```

---

## Step 1 – Create the Google Sheet + backend

1. Go to https://sheets.google.com → create a blank sheet, name it `DayOff Submissions`.
2. Menu **Extensions → Apps Script**.
3. Delete everything in `Code.gs`, paste the full content of `google-apps-script/Code.gs`.
4. Edit the `CONFIG` block at the top:
   - `ADMIN_PASSWORD` → your own password
   - `MAX_DAYS_OFF` → max days per person per week
   - `WAREHOUSES` → the real employee IDs for each warehouse
5. Click **Save** (disk icon).

## Step 2 – Deploy the backend as a Web App

1. Click **Deploy → New deployment**.
2. Gear icon ⚙ → **Web app**.
3. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy** → **Authorize access** → choose your Google account.
   If you see "Google hasn't verified this app": **Advanced → Go to (project name) (unsafe)** → **Allow**. (It's your own script, so this is fine.)
5. Copy the **Web app URL** (ends in `/exec`).
6. Test it: open the URL in your browser. You should see JSON with your warehouses.

## Step 3 – Connect the website

Open `config.js` in VS Code and paste the URL:

```js
const API_URL = 'https://script.google.com/macros/s/XXXXXXXX/exec';
```

## Step 4 – Test locally in VS Code

1. Install the **Live Server** extension (by Ritwick Dey).
2. Right-click `index.html` → **Open with Live Server**.
3. Pick `Joybuy`, enter `JB001`, select days, write a reason, submit.
4. Try `JB001` with `Berlin J&T` → it must be rejected.
5. Check the Google Sheet → a `Submissions` tab appears with the row.
6. Open `admin.html`, log in, click **Download Excel**.

## Step 5 – Publish on GitHub Pages

1. Create a free account at https://github.com.
2. Click **New repository** → name it e.g. `dayoff` → **Public** → Create.
3. In VS Code terminal (in the `dayoff-site` folder):

```bash
git init
git add .
git commit -m "Day-off website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/dayoff.git
git push -u origin main
```

4. On GitHub: repository **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → **Save**.
5. After 1–2 minutes your site is live at:
   `https://YOUR-USERNAME.github.io/dayoff/`
   Admin: `https://YOUR-USERNAME.github.io/dayoff/admin.html`

---

## Everyday changes

| Want to… | Do this |
|---|---|
| Add/remove employee IDs, change password or max days | Edit `CONFIG` in Apps Script → **Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy**. The URL stays the same. |
| Change the website look | Edit files in VS Code → `git add . && git commit -m "update" && git push` |
| Add a new warehouse | Add it to `WAREHOUSES` in Apps Script and redeploy (the dropdown updates automatically) |

**Important:** after any change to the Apps Script code, you must deploy a **new version**, or the website keeps using the old code.

## How it works

- The poll always shows **next week (Mon–Sun)**, Berlin time.
- One submission per employee per week. Submitting again **updates** the previous choice.
- IDs and the admin password live only in Google Apps Script, so they are **not visible** in the website source.
- An ID only works in its own warehouse.
- All data is also visible directly in your Google Sheet.

## Troubleshooting

- **"Setup missing"** → `config.js` still has the placeholder URL.
- **"Could not reach the server"** → Web app access must be **Anyone**; URL must end with `/exec`.
- **Changes in Apps Script have no effect** → deploy a new version (see table above).
