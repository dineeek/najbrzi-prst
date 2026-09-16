# Privacy

Najbrži prst does not collect, store or transmit any personal data.

- Everything you configure (opening time, picked buttons, texts, language) is
  kept in Chrome's local extension storage on your computer. It never leaves
  the browser.
- The extension runs only on sites you enable yourself from its popup. On such
  a site it sends `HEAD` requests to that site's own origin to read the `Date`
  header for clock sync. No request goes to any other server.
- There is no analytics, no telemetry, no remote code and no account.
- Removing a site from the popup or uninstalling the extension deletes the
  stored settings for it.

Questions: open an issue at https://github.com/dineeek/najbrzi-prst/issues.
