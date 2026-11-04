import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('proxied document CSP authorizes explicit host despite opaque sandbox origin',()=>{
  const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
  assert.match(source,/function pageContentPolicy\(origin = proxyOrigin\)/);
  assert.match(source,/script-src " \+ origin/);
  assert.match(source,/style-src " \+ origin/);
  assert.match(source,/img-src " \+ origin/);
  assert.match(source,/RENDER_EXTERNAL_HOSTNAME/);
});
test('HTML frame keeps script sandbox without same-origin',()=>{
  const source=fs.readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(source,/sandbox="allow-scripts"/);
  assert.doesNotMatch(source,/allow-same-origin/);
});
