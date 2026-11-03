# EmProx

Self-hosted lightweight HTML page viewer for Render. Version 0.4.0.

## What works
- Violet browser UI with Go, Reload, Home, Close, and an about:blank wrapper tab.
- Public HTTP(S) website hostnames are allowed by default; the old two-host allowlist is removed.
- HTML, JavaScript, stylesheets, images and fonts are proxied; navigation and asset links are rewritten.
- Domain denylist via `BLOCKED_HOSTS`, plus a limited adult/gore-themed hostname keyword screen.
- Defense-in-depth: DNS-based private address rejection, IP-literal blocking, redirect validation, response size and timeout limits, and a basic per-IP rate limit.

## Important limitations
**This is not a full browser.** Inline and classic external JavaScript now run inside a sandboxed iframe without same-origin privileges. Login, video, modules, fetch/XHR, workers and complex apps may still fail. Never add allow-same-origin alongside allow-scripts to the viewer iframe. Adult/gore filters based on domain names and keywords are *not comprehensive*: they cannot detect all inappropriate material and can occasionally block harmless domains. For dependable category blocking, integrate a maintained classification/DNS service and enforce the policy on every upstream request. Do not rely on this MVP for child-safety guarantees.

The project should not be exposed as an unrestricted public proxy. Add authorization, edge rate-limiting, abuse monitoring, and deployment controls before widely sharing it.

## Render setup
1. Create a **Web Service** from this repository (or use Render Blueprint via `render.yaml`).
2. Build: `npm install`. Start: `npm start`.
3. Environment setting `BLOCKED_HOSTS` is a comma-separated list of blocked hostname suffixes (e.g. `blocked.example,another-blocked.example`). Blank by default. Do not include schemes.
4. Deploy or redeploy after configuration changes.

Other options: `PORT` (default 3000), `MAX_BYTES` (default 2097152), `REQUEST_TIMEOUT_MS` (default 10000).

## Local
```sh
npm install
npm test
npm start
```

Open http://localhost:3000.

## v0.4.1 DNS hotfix
The HTTP client can request DNS results with `all: true`. EmProx now returns the required address records array in that mode. Previously this caused `Invalid IP address: undefined` when opening sites such as YouTube. This fixes the connection-level bug but does not make YouTube's dynamic player compatible: JavaScript fetching, media streaming and login remain unsupported.
