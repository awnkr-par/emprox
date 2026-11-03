import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { blockedHosts, parseTarget, safeLookup } from './lib/targets.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const port = Number(process.env.PORT || 3000);
const maxBytes = Math.min(Number(process.env.MAX_BYTES) || 2097152, 10485760);
const timeout = Math.min(Number(process.env.REQUEST_TIMEOUT_MS) || 10000, 30000);
const rateLimitWindow = 60_000;
const maxRequestsPerMinute = 50;
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
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png' };
const uiCsp = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; frame-src 'self'; object-src 'none'; base-uri 'none'";
const pageCsp = "default-src 'none'; script-src 'self' 'unsafe-inline'; connect-src 'none'; worker-src 'none'; frame-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; form-action 'none'; object-src 'none'; base-uri 'none'";

function send(res, code, body, type='text/plain; charset=utf-8', proxied=false) {
  res.writeHead(code, {'Content-Type':type, 'X-Content-Type-Options':'nosniff',
    'Referrer-Policy':'no-referrer', 'Content-Security-Policy':proxied?pageCsp:uiCsp,
    'Cache-Control':'no-store', 'X-Frame-Options':'SAMEORIGIN'});
  res.end(body);
}

function fetchOne(url) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? https : http;
    const request = lib.get(url, {
      headers: { 'user-agent':'EmProx/0.1 (+self-hosted HTML viewer)',
        'accept':'text/html,text/css,image/*;q=0.9,*/*;q=0.5',
        'accept-encoding':'identity' },
      lookup: safeLookup, timeout, maxHeaderSize: 16384
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
    if (response.status !== 200) throw new Error('Upstream HTTP ' + response.status);
    return response;
  }
  throw new Error('Too many redirects');
}

function proxiedUrl(raw, base, kind='browse') {
  if (!raw || raw.startsWith('#')) return '#';
  try { return '/' + kind + '?url=' + encodeURIComponent(parseTarget(raw, base).href); }
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
      if ((el.attr('rel') || '').toLowerCase() === 'stylesheet')
        el.attr('href', proxiedUrl(el.attr('href'), base, 'asset'));
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

function errorPage(message) {
  const safe=String(message).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return '<!doctype html><html><head><meta charset="utf-8"><title>EmProx — Page error</title></head>'+
    '<body style="font:16px system-ui;padding:2rem;color:#241333;background:#f9f4fd">'+
    '<h2>EmProx could not open this page</h2><p>'+safe+'</p>'+
    '<p>This viewer only supports public HTML sites not blocked by its content settings, and supports basic JavaScript in an isolated frame.</p></body></html>';
}

function staticFile(res, filename) {
  const filepath=path.join(root,filename);
  fs.readFile(filepath,(err,contents)=> err
    ? send(res,404,'Not found')
    : send(res,200,contents,mime[path.extname(filename)] || 'application/octet-stream'));
}

function incomingErrorBody(req,message){
  try { const url=new URL(req.url,'http://localhost'); if(url.pathname==='/browse')return errorPage(message); }
  catch {}
  return errorPage(message);
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
    if (incoming.pathname !== '/browse' && incoming.pathname !== '/asset')
      return send(res,404,'Not found');
    if (limited(req)) return send(res,429,'Request limit reached. Try again shortly.');
    if (!incoming.searchParams.has('url')) return send(res,400,'Missing url');
    const result = await fetchAllowed(incoming.searchParams.get('url'));
    const type = (result.headers['content-type'] || '').split(';')[0].toLowerCase();
    if (incoming.pathname === '/browse') {
      if (type !== 'text/html' && type !== 'application/xhtml+xml')
        return send(res,415,'This URL is not an HTML document',undefined,true);
      return send(res,200,rewriteHtml(result.body.toString('utf8'),result.url),
        'text/html; charset=utf-8',true);
    }
    if (type === 'text/css')
      return send(res,200,rewriteCss(result.body.toString('utf8'),result.url),
        'text/css; charset=utf-8',true);
    if (['text/javascript','application/javascript','application/x-javascript'].includes(type))
      return send(res,200,result.body,'application/javascript; charset=utf-8',true);
    if (!type.startsWith('image/') || type === 'image/svg+xml')
      if (!type.startsWith('font/') && !['application/font-woff','application/font-woff2'].includes(type))
        return send(res,415,'Asset type not supported',undefined,true);
    return send(res,200,result.body,type,true);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Proxy error';
    const rejected=/blocked|Only public|URL|HTTP|ports|Credentials|Host/.test(message);
    send(res,rejected?400:502,incomingErrorBody(req,message), 'text/html; charset=utf-8',true);
  }
});
server.listen(port,'0.0.0.0',()=>console.log('EmProx listening on',port));
