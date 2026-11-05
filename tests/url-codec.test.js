import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeUrl, decodeUrl, getTargetParam } from '../lib/url-codec.js';
import { parseTarget } from '../lib/targets.js';

test('round trips URLs with Unicode and query parameters', () => {
  const url='https://example.org/search?q=café&lang=en';
  const encoded=encodeUrl(url);
  assert.match(encoded,/^[A-Za-z0-9_-]+$/);
  assert.equal(decodeUrl(encoded),url);
});
test('rejects corrupt encoded addresses', () => {
  for(const value of ['', '***', 'abc=', 'a'.repeat(8200)])
    assert.throws(()=>decodeUrl(value));
});
test('encoded and legacy links must pass target validation', () => {
  assert.equal(parseTarget(getTargetParam(new URLSearchParams({u:encodeUrl('https://github.com/')}))).hostname,'github.com');
  assert.equal(parseTarget(getTargetParam(new URLSearchParams({url:'https://github.com/'}))).hostname,'github.com');
  assert.throws(()=>parseTarget(getTargetParam(new URLSearchParams({u:encodeUrl('http://localhost/')}))));
  assert.throws(()=>parseTarget(getTargetParam(new URLSearchParams({u:encodeUrl('https://porn.example.org/')}))));
});
