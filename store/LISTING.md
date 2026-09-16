# Chrome Web Store submission

Everything the Developer Dashboard asks for, in the order it asks.

## Package

```bash
npm run zip
```

Produces `najbrzi-prst.zip` from a fresh `dist/` build. Upload that file. The
manifest version comes from `package.json`, bump it there before every upload
(the store rejects a version that was already published).

## Store listing

Name is taken from the manifest per locale: Croatian users see „Najbrži prst",
others see "Fastest Finger". Default locale is Croatian.

**Summary (max 132 characters)**

- HR:
  `Klik na odabrani gumb u točnoj sekundi poslužitelja: sinkronizacija sata, odabir gumba, odbrojavanje, proba i ručni način.`
- EN:
  `Clicks a chosen button at an exact server-synced second: clock sync, element picker, countdown, dry run and manual mode.`

**Description, Croatian**

```
Najbrži prst klikne odabrani gumb u točnoj sekundi po satu poslužitelja.
Napravljen za javne pozive na kojima sredstva idu po redoslijedu zaprimanja
(eFZOEU), a radi na bilo kojoj stranici koju sam uključiš.

Kako radi
• Sinkronizira sat s poslužiteljem stranice (Date zaglavlje, hvatanje granice
  sekunde) i prikazuje vrijeme poslužitelja s milisekundama i odbrojavanje.
• Križićem odabereš točan gumb. Sprema se stabilan CSS selektor i tekst gumba,
  oboje se provjerava prije klika. Može se odabrati i onemogućen gumb.
• Izvodi koraka redom: čeka da gumb bude vidljiv i omogućen, klikne i ponavlja
  dok se ne pojavi tekst uspjeha ili sljedeći gumb. Zadnji korak klikće samo
  jednom.
• Osvježi stranicu ako je prvi gumb i dalje onemogućen nakon otvaranja i
  nastavlja nakon osvježavanja.

Tri načina
• RUČNO: odbrojavanje, bljesak, zvuk i fokus na gumb, a ti klikneš.
• PROBA: samo označava gumbe, ništa se ne klikće.
• UŽIVO: klikće umjesto tebe.

Na efzoeu.gov.hr koraci su unaprijed popunjeni prema službenoj uputi. Prije
korištenja uživo pročitaj Opće uvjete korištenja sustava eFZOEU (čl. 10. st.
7.): automatizirano podnošenje može značiti isključenje iz financiranja.
Preporučeni način na eFZOEU je RUČNO.

Proširenje ne traži pristup nijednoj stranici unaprijed. Uključiš ga po
stranici iz skočnog prozora. Ne prikuplja nikakve podatke.
```

**Description, English**

```
Najbrži prst ("fastest finger") clicks a chosen button at an exact
server-synced second. Made for Croatian public calls where funds go by order
of receipt (eFZOEU), it works on any site you enable yourself.

How it works
• Syncs a clock to the site's server (Date header, second-boundary
  bracketing) and shows server time with milliseconds plus a countdown.
• Pick the exact button with a crosshair. A stable CSS selector and the
  button text are stored and both are verified before clicking. Disabled
  buttons can be picked too.
• Runs steps in order: waits until the button is visible and enabled, clicks,
  and retries until the success text or the next button shows up. The last
  step clicks once, never twice.
• Reloads the page if the first button is still disabled after the opening
  second and resumes after the reload.

Three modes
• MANUAL: countdown, flash, beep and focus on the button, you press it.
• DRY RUN: highlights the buttons, nothing is clicked.
• LIVE: clicks for you.

On efzoeu.gov.hr the steps come prefilled from the official manual. Read a
site's terms before using live mode: some portals forbid automated
submissions. Manual mode is the recommended way on eFZOEU.

The extension asks for no site access up front. You enable it per site from
the popup. It collects no data.
```

**Category:** Productivity → Tools. **Language:** Croatian (primary), English.

**Graphics**

- Icon 128×128: `public/icons/icon128.png` (already in the zip).
- Screenshots 1280×800: `store/screenshots/1-panel-hr.png`, `2-panel-en.png`,
  `3-run-done.png`.
- Small promo tile 440×280 and marquee 1400×560: optional, not provided.

## Privacy practices

**Single purpose:** Fire a click on a button the user picked, at a time the user
set, synced to the site's server clock.

**Permission justifications**

- `storage`: keeps the user's settings (opening time, picked buttons, texts,
  language) locally.
- `notifications`: desktop notification when a run finishes, fails or the
  session expires, so the user does not have to watch the tab.
- `scripting`: injects the panel into the sites the user enabled, and registers
  it for future visits to those sites.
- `offscreen`: plays the alert beep from an offscreen document, which works even
  when the page itself has no user gesture after a reload.
- `activeTab`: reads the current tab's URL in the popup to offer "Enable on this
  site".
- Host permissions (`http://*/*`, `https://*/*`, all optional): the extension
  runs only on origins the user enables one by one from the popup. It needs the
  origin to inject the panel and to send HEAD requests to that same origin for
  clock sync. Nothing is requested at install time.

**Remote code:** No, all code is in the package.

**Data usage:** the extension does not collect or transmit any of the listed
data categories. Certify: not sold to third parties, not used for purposes
unrelated to the single purpose, not used for creditworthiness or lending.

**Privacy policy URL:**
`https://github.com/dineeek/najbrzi-prst/blob/main/PRIVACY.md`

## Distribution

Visibility: Public (or Unlisted for a first round). Regions: all. Free.

## Notes for the reviewer (paste into "Notes for reviewers")

```
Test page: clone https://github.com/dineeek/najbrzi-prst, run
`npm run fixture`, open http://localhost:8765/?at=HH:MM:SS&lang=hr with a time
a minute ahead. Click the toolbar icon, press "Uključi na localhost:8765". The
panel appears bottom right. Pick the „Podnesi prijavu" button with "Odaberi
gumb", set the opening time to the same HH:MM:SS, and press "Aktiviraj RUČNO"
or "Aktiviraj UŽIVO". Host permissions are optional and
granted per site by the user; no site is accessed before that.
```

## Before every submission

1. Bump `version` in `package.json`, commit, tag `vX.Y.Z` (the release workflow
   builds the same zip and attaches it to a GitHub release).
2. `npm run zip`, upload `najbrzi-prst.zip`.
3. Re-check the permission justifications above if the manifest changed.
