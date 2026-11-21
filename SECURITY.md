https://hq.globaltech.org/courses/11059/assignments/43772/submissions/57713# Security and privacy notes

Bearly Chat is a static web app. It has no server database, accounts or analytics, and it stores check-ins in the browser (IndexedDB) on the device.

## Design choices

- **Saving is off by default.** Do Not Save prevents new check-ins and notes from being stored and prevents location requests. Previously saved records remain until cleared.
- **Optional user profiles.** User names are stored locally even when Do Not Save is on. Profiles organize records but do not protect them from other device users.
- **Location is off by default.** The app asks for location only if an adult turns on "Save location with check-ins" in Settings. New check-ins saved with it off contain no coordinates, accuracy or map link; older records may still contain location.
- **No third-party resources.** Fonts use device fonts and scripts are served from this site. A Content Security Policy (meta tag) restricts resources and connections to the app's origin and blocks inline styles, plugins and form submissions. The main page permits inline scripts.
- **No HTML injection.** User text (notes, feelings) is written with `textContent`, never `innerHTML`. CSV export neutralizes string cells starting with whitespace followed by `=`, `+`, `-` or `@`.
- **No referrer.** A `no-referrer` policy keeps page addresses out of outgoing links.

## Maintainer checklist

- Turn on two-factor authentication for the GitHub account that publishes this site. Installed copies update themselves from this repository, so control of the account is control of the app.
- Require pull requests or at least review commits before publishing to the `main` branch, and keep the repository free of secrets.
- Bump `CACHE_NAME` in `service-worker.js` whenever any app file changes.
- Run `node --test tests/*.test.js` before publishing.
- If the app is ever used by an agency, add device-level protection (screen lock and device encryption) and get the agency's written permission first. The browser database itself is not encrypted.

## Reporting a problem

Please report security or privacy concerns privately to the maintainer rather than in a public issue.
