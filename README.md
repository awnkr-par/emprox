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

## v0.5.0
- Removed top-left EmProx logo/wordmark.
- Added a persistent dark/light toggle.
- Improved CSS link recognition, CSS fallback MIME support, font responses and asset request rate limit (50 to 300/minute).
- Complex sites such as YouTube may still fail because the proxy does not support their dynamic network APIs.

## v0.6.0: upstream rejection diagnostics
- Destination HTTP failures (including 418) are distinguished from EmProx policy blocks.
- A safe direct-site link is displayed for upstream refusals and there is an **Open original site** control in the interface.
- A more current EmProx User-Agent and Accept-Language header improve basic request compatibility.
- A 418 is a response from the destination and cannot be fixed by removing the EmProx blocklist. Sites can reject proxy/datacenter requests and may require features this proxy lacks.

## v0.7.0: broken stylesheets
A sandbox without `allow-same-origin` gives the document an opaque origin. The previous CSP's `'self'` policy could prevent browser loading of the proxy's own rewritten stylesheets and scripts, including GitHub's CSS bundles. The page CSP now explicitly allows the configured **proxy origin** for CSS, JS, fonts, and images while keeping the isolated script-capable sandbox.

Render automatically sets `RENDER_EXTERNAL_HOSTNAME` for deployed services. On a custom domain, set `PUBLIC_ORIGIN` to that full origin (e.g. `https://proxy.example.com`, no trailing paths). For local development the default is `http://localhost:3000`. Pages whose upstream servers reject Render requests still cannot be displayed reliably.

## v0.8.0: performance and partial-loading improvements
- Reuse upstream HTTP(S) connections with keep-alive agents to reduce repeated TLS handshakes.
- Cache successful public CSS, JavaScript, images and fonts in a bounded 24 MiB, ten-minute memory cache. Browser assets can also reuse responses for ten minutes. No HTML or error pages are cached.
- Increase max upstream body default from 2 MiB to 8 MiB (up to 16 MiB configurable) to avoid cutting off large bundles, and increase the shared request threshold from 300 to 1200 per minute.
- URL/blocklist/private DNS checks remain in place for every cache miss. Cache clears on restarts.
- **Not solved:** Modern apps such as GitHub and YouTube rely on fetch/XHR, dynamic modules, service workers, streaming and other APIs that this viewer still does not proxy. A page can appear partially loaded even if all static resources work.
