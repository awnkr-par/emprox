# EmProx
A small, self-hosted, **allowlisted** web page viewer/proxy built with Node.js. First MVP for Render.

## Features
- Clean browser-style UI with address bar and embedded page viewer
- Proxies server-rendered HTML, images, fonts and stylesheets from permitted sites
- Rewrites navigation links and asset URLs to stay within EmProx
- Restricts upstream destinations to an explicit hostname allowlist
- Rejects local/private network addresses, oversized responses, unsafe schemes and unapproved redirects
- Has no cookie forwarding, script execution, login support, or open-proxy mode

**Limitations:** This is an intentionally limited HTML viewer, not a full browser. JavaScript-heavy sites, authentication, media streams, dynamic apps and sites with complex security policies will not work.

## Deploy to Render
1. Connect this repository on [Render](https://dashboard.render.com/).
2. Choose **New > Web Service** (NOT Static Site). The checked-in `render.yaml` also supports Blueprint deployment.
3. Runtime: Node; build: `npm install`; start: `npm start`.
4. Configure `ALLOWED_HOSTS` with comma-separated **trusted public** hostnames you want to permit. Default: `example.com,example.org`. Wildcards are not accepted.
5. Deploy. Open the Render URL.

Environment options:
- `ALLOWED_HOSTS`: explicit trusted hostname list
- `PORT`: injected by Render, defaults to 3000
- `MAX_BYTES`: maximum upstream response size (default 2097152)
- `REQUEST_TIMEOUT_MS`: upstream request timeout (default 10000)

## Local development
```sh
npm install
npm test
npm start
```
Open http://localhost:3000

## Security notes
This proxy is deliberately *not* an unrestricted anonymizing proxy or a tool for bypassing site access controls. Do not add localhost, private IPs, or untrusted domains to `ALLOWED_HOSTS`. The service does not send user credentials upstream; the content is fetched by the server and sanitized before display. The server does not persist browsing history. Upstream sites see the server's IP rather than the visitor's IP. Deploy only in compliance with Render and destination-site rules.

## Next milestones
- Better renderer compatibility, tests for redirects and hostile markup
- Authentication and rate limits for public hosting
- Favorites/history stored locally on the frontend
- Optional integration with the EDUrocks frontend
