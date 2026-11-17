# PrivyPDF

PrivyPDF is a private PDF toolkit that runs entirely in your browser. No uploads, no accounts, no trackers — your documents never leave your device.

> The editor is being rebuilt from scratch and will be back soon. The landing page and privacy model are live; editor.html is a placeholder until the new editor ships.

## Run locally

PrivyPDF is a static site with no build step. From the repo root:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000. Serve over HTTP rather than opening index.html directly, so JavaScript modules and the security headers apply.

## Folder structure

| Path | Purpose |
| --- | --- |
| index.html | Landing page |
| privacy.html | Privacy model and verification guidance |
| editor.html | Editor placeholder (rebuild in progress) |
| css/main.css | Shared styles |
| js/ | Landing page and shared UI modules |
| assets/ | Brand logo and icon |
| vendor/ | Self-hosted PDF.js, pdf-lib, and fonts |
| _headers | Security headers for compatible static hosts |
| Dockerfile | nginx image serving the static site |
| .dockerignore | Files excluded from the Docker image |

## Privacy principle

No uploads. Everything is processed in the browser with self-hosted engines (PDF.js, pdf-lib) and self-hosted fonts; no third-party CDN. Every page enforces a strict Content Security Policy (connect-src 'self'), and _headers adds further security headers on supported static hosts. Files live only in the current tab and are discarded when you close or reload it.
