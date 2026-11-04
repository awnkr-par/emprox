import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../server.js', import.meta.url),'utf8');

test('upstream clients keep connections alive',()=>{
  assert.match(source,/new http.Agent\(\{ keepAlive: true/);
  assert.match(source,/new https.Agent\(\{ keepAlive: true/);
});
test('static asset cache is bounded and TTL restricted',()=>{
  assert.match(source,/const cacheMaxBytes = 24 \* 1024 \* 1024/);
  assert.match(source,/const cacheTtlMs = 10 \* 60 \* 1000/);
  assert.match(source,/const cached=isAsset \? cacheGet/);
  assert.match(source,/cachePut\(targetUrl.href/);
});
test('pages remain uncached and blocks remain enforced',()=>{
  assert.match(source,/const targetUrl=parseTarget\(incoming.searchParams.get\('url'\)\)/);
  assert.match(source,/cacheSeconds > 0 \?/);
  assert.match(source,/if \(incoming.pathname === '\/browse'\)/);
});
