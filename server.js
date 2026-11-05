import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { blockedHosts, parseTarget, safeLookup } from './lib/targets.js';
import { encodeUrl, getTargetParam } from './lib/url-codec.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const maxBytes = Math.min(Number(process.env.MAX_BYTES) || 8388608, 16777216);
const timeout = Math.min(Number(process.env.REQUEST_TIMEOUT_MS) || 10000, 30000);
const rateLimitWindow = 60_000;
const maxRequestsPerMinute = 1200;
const hits = new Map();
function limited(req) {
  // No forwarding headers: only trust the immediate network peer.
  const key = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (hits.size > 5000) for (const [ip, record] of hits)
    if (now - record.started > rateLimitWindow) hits.delete(ip);
  const record = hits.get(key);
  if (!record || now - record.started > rateLimitWindow) {
    hits.set(key, { started: now, count: 1 }); return false;
  }
  record.count += 1;
  return record.count > maxRequestsPerMinute;
}
// Keep upstream sockets warm across CSS, JS and image requests.
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 48, maxFreeSockets: 12 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 48, maxFreeSockets: 12 });
// Small bounded in-process cache for public static assets only.
const assetCache = new Map();
const cacheMaxBytes = 24 * 1024 * 1024;
const cachePerItemLimit = 2 * 1024 * 1024;
const cacheTtlMs = 10 * 60 * 1000;
let cachedBytes = 0;
function cacheGet(key) {
  const item = assetCache.get(key);
  if (!item) return null;
  if (Date.now() >= item.expires) { assetCache.delete(key); cachedBytes -= item.body.length; return null; }
  assetCache.delete(key); assetCache.set(key,item);
  return item;
}
function cachePut(key,body,type) {
  if (!body?.length || body.length > cachePerItemLimit) return;
  const existing=assetCache.get(key);
  if(existing){ cachedBytes -= existing.body.length; assetCache.delete(key); }
  assetCache.set(key,{body,type,expires:Date.now()+cacheTtlMs});
  cachedBytes += body.length;
  while(cachedBytes > cacheMaxBytes && assetCache.size){
    const first=assetCache.keys().next().value;
    const removed=assetCache.get(first);
    assetCache.delete(first);
    cachedBytes -= removed.body.length;
  }
}
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };
const uiCsp = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-src 'self' https://www.youtube.com; object-src 'none'; base-uri 'none'";
// Sandboxed pages have opaque origins: CSP 'self' does not reliably match
// /asset on the hosting origin. Explicitly authorize only the proxy origin.
// Render sets RENDER_EXTERNAL_HOSTNAME automatically.
const configuredOrigin = process.env.PUBLIC_ORIGIN ||
  (process.env.RENDER_EXTERNAL_HOSTNAME ? 'https://' + process.env.RENDER_EXTERNAL_HOSTNAME : 'http://localhost:' + port);
const parsedOrigin = new URL(configuredOrigin);
if (!['https:', 'http:'].includes(parsedOrigin.protocol) ||
    parsedOrigin.username || parsedOrigin.password || parsedOrigin.pathname !== '/' ||
    parsedOrigin.search || parsedOrigin.hash) {
  throw new Error('PUBLIC_ORIGIN must be a plain http(s) origin');
}
const proxyOrigin = parsedOrigin.origin;
export function pageContentPolicy(origin = proxyOrigin) {
  return "default-src 'none'; " +
    "script-src " + origin + " 'unsafe-inline'; " +
    "style-src " + origin + " 'unsafe-inline'; " +
    "img-src " + origin + " data:; font-src " + origin + " data:; " +
    "connect-src 'none'; worker-src 'none'; frame-src 'none'; " +
    "form-action 'none'; object-src 'none'; base-uri 'none'";
}
const pageCsp = pageContentPolicy();

function send(res, code, body, type='text/plain; charset=utf-8', proxied=false, cacheSeconds=0) {
  res.writeHead(code, {'Content-Type':type, 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer', 'Content-Security-Policy':proxied?pageCsp:uiCsp,
    'Cache-Control':cacheSeconds > 0 ? 'public, max-age=' + cacheSeconds : 'no-store', 'X-Frame-Options':'SAMEORIGIN'});
  res.end(body);
}

function fetchOne(url) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const request = lib.get(url, {
      headers: { 'user-agent':'emPROx/0.6 (+self-hosted page viewer)',
        'accept':'text/html,text/css,image/*;q=0.9,*/*;q=0.5',
        'accept-encoding':'identity', 'accept-language':'en-US,en;q=0.9' },
      lookup: safeLookup, agent: url.protocol === 'https:' ? httpsAgent : httpAgent,
      timeout, maxHeaderSize: 16384
    }, upstream => {
      const chunks = []; let total = 0;
      upstream.on('data', chunk => {
        total += chunk.length;
        if (total > maxBytes) {
          request.destroy(new Error('Upstream response exceeds size limit'));
        } else chunks.push(chunk);
      });
      upstream.on('end', () => resolve({status:upstream.statusCode,
        headers:upstream.headers, body:Buffer.concat(chunks), url}));
      upstream.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Upstream timed out')));
    request.on('error', reject);
  });
}

async function fetchAllowed(raw) {
  let url = parseTarget(raw);
  for (let i=0; i<5; i++) {
    const response = await fetchOne(url);
    if ([301,302,303,307,308].includes(response.status)) {
      if (!response.headers.location) throw new Error('Redirect without Location');
      url = parseTarget(response.headers.location, url);
      continue;
    }
    if (response.status !== 200) {
      const error = new Error('Upstream HTTP ' + response.status);
      error.upstreamStatus = response.status;
      error.upstreamUrl = url.href;
      throw error;
    }
    return response;
  }
  throw new Error('Too many redirects');
}

function proxiedUrl(raw, base, kind='browse') {
  if (!raw || raw.startsWith('#')) return '#';
  try { return '/' + kind + '?u=' + encodeUrl(parseTarget(raw, base).href); }
  catch { return '#'; }
}

function rewriteCss(css, base) {
  return css.replace(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi, (_all, a,b,c) => {
    const value = (a || b || c || '').trim();
    if (value.startsWith('data:')) return 'url("'+value.replace(/"/g, '')+'")';
    return 'url("'+proxiedUrl(value, base, 'asset')+'")';
  }).replace(/@import\s+(?:"([^"]+)"|'([^']+)')/gi, (_all,a,b) =>
    '@import url("'+proxiedUrl(a||b, base, 'asset')+'")');
}

function rewriteHtml(source, base) {
  const $ = load(source, { decodeEntities:true });
  $('iframe,frame,object,embed,form,base,meta[http-equiv],link[rel=preload],link[rel=modulepreload]').remove();
  $('*').each((_i, element) => {
    const el = $(element);
    for (const name of Object.keys(element.attribs || {})) {
      if (['srcset','ping','integrity','nonce','formaction'].includes(name.toLowerCase())) el.removeAttr(name);
    }
    if (el.attr('style')) el.attr('style', rewriteCss(el.attr('style'), base));
    if (el.is('script')) {
      if (el.attr('src')) el.attr('src', proxiedUrl(el.attr('src'), base, 'asset'));
      el.removeAttr('crossorigin');
    } else if (el.is('a')) {
      el.attr('href', proxiedUrl(el.attr('href'), base));
      el.removeAttr('target'); el.removeAttr('download');
    } else if (el.is('link')) {
      if ((el.attr('rel') || '').toLowerCase().split(/\s+/).includes('stylesheet')) {
        el.attr('href', proxiedUrl(el.attr('href'), base, 'asset'));
        el.removeAttr('crossorigin');
        el.removeAttr('integrity');
      }
      else el.remove();
    } else if (el.attr('href')) el.removeAttr('href');
    for (const attr of ['src','poster','background']) {
      if (el.is('script') && attr === 'src') continue;
      if (el.attr(attr)) el.attr(attr, proxiedUrl(el.attr(attr), base, 'asset'));
    }
  });
  $('style').each((_i, e) => $(e).text(rewriteCss($(e).html() || '', base)));
  return $.html();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function errorPage(message, upstreamStatus, upstreamUrl) {
  const refused = Number.isInteger(upstreamStatus);
  const heading = refused ? 'The destination declined the request' : 'emPROx could not open this page';
  const explanation = refused
    ? 'The destination server returned HTTP ' + upstreamStatus +
      '. This is not an emPROx blocklist decision. Some sites reject server-side proxies, automated requests, or datacenter IP addresses.'
    : message;
  let direct = '';
  if (refused && upstreamUrl) {
    try {
      const url = parseTarget(upstreamUrl);
      direct = '<p><a href="' + escapeHtml(url.href) +
        '" target="_blank" rel="noopener noreferrer">Open original website directly</a></p>';
    } catch {}
  }
  return '<!doctype html><html><head><meta charset="utf-8"><title>emPROx — Page error</title>'+
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
    '<body style="font:16px system-ui;padding:2rem;color:#241333;background:#f9f4fd">'+
    '<h2>'+escapeHtml(heading)+'</h2><p>'+escapeHtml(explanation)+'</p>'+direct+
    '<p>emPROx cannot override a destination server rejection. Direct access opens outside the proxy.</p></body></html>';
}

function staticFile(res, filename) {
  const filepath=path.join(root,filename);
  fs.readFile(filepath,(err,contents)=> err
    ? send(res,404,'Not found')
    : send(res,200,contents,mime[path.extname(filename)] || 'application/octet-stream'));
}

const server = http.createServer(async (req,res) => {
  try {
    if (req.method !== 'GET') return send(res,405,'GET only');
    const incoming = new URL(req.url, 'http://localhost');
    if (incoming.pathname === '/healthz') return send(res,200,'ok');
    if (incoming.pathname === '/config') return send(res,200,
      JSON.stringify({ blockedHosts:blockedHosts(), publicSites:true }), 'application/json; charset=utf-8');
    if (incoming.pathname === '/') return staticFile(res,'index.html');
    if (incoming.pathname === '/style.css') return staticFile(res,'style.css');
    if (incoming.pathname === '/app.js') return staticFile(res,'app.js');
    if (incoming.pathname === '/youtube.js') return staticFile(res,'youtube.js');
    if (incoming.pathname !== '/browse' && incoming.pathname !== '/asset')
      return send(res,404,'Not found');
    if (limited(req)) return send(res,429,'Request limit reached. Try again shortly.');
    const targetUrl=parseTarget(getTargetParam(incoming.searchParams));
    const isAsset=incoming.pathname === '/asset';
    const cached=isAsset ? cacheGet(targetUrl.href) : null;
    if(cached) return send(res,200,cached.body,cached.type,true,600);
    const result = await fetchAllowed(targetUrl.href);
    const type = (result.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (incoming.pathname === '/browse') {
      if (type !== 'text/html' && type !== 'application/xhtml+xml')
        return send(res,415,'This URL is not an HTML document',undefined,true);
      return send(res,200,rewriteHtml(result.body.toString('utf8'),result.url),
        'text/html; charset=utf-8',true);
    }
    if (type === 'text/css' || (result.url.pathname.toLowerCase().endsWith('.css') && ['text/plain','application/octet-stream',''].includes(type)))
    {
      const body=Buffer.from(rewriteCss(result.body.toString('utf8'),result.url));
      cachePut(targetUrl.href,body,'text/css; charset=utf-8');
      return send(res,200,body,'text/css; charset=utf-8',true,600);
    }
    if (['text/javascript','application/javascript','application/x-javascript'].includes(type)) {
      cachePut(targetUrl.href,result.body,'application/javascript; charset=utf-8');
      return send(res,200,result.body,'application/javascript; charset=utf-8',true,600);
    }
    if (!type.startsWith('image/') || type === 'image/svg+xml')
      if (!type.startsWith('font/') && !['application/font-woff','application/font-woff2','application/octet-stream'].includes(type))
        return send(res,415,'Asset type not supported',undefined,true);
    cachePut(targetUrl.href,result.body,type);
    return send(res,200,result.body,type,true,600);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    const rejected=/blocked|Only public|URL|HTTP|ports|Credentials|Host/.test(message);
    const body=errorPage(message,error.upstreamStatus,error.upstreamUrl);
    send(res,error.upstreamStatus ? 502 : rejected ? 400 : 502,body,'text/html; charset=utf-8',true);
  }
});
server.listen(port,'0.0.0.0',()=>console.log('emPROx listening on',port));
