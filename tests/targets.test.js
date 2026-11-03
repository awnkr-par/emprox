import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTarget, isPublicAddress } from '../lib/targets.js';

test('valid allowed destination',()=>{
  assert.equal(parseTarget('https://example.org/path?q=1').hostname,'example.org');
});
test('rejects disallowed hosts and schemes',()=>{
  for(const url of ['http://localhost','http://127.0.0.1','https://evil.example',
    'file:///etc/passwd','http://example.org:8080','https://user:pass@example.org/']){
    assert.throws(()=>parseTarget(url));
  }
});
test('rejects private addresses',()=>{
  for(const ip of ['127.0.0.1','10.0.0.2','172.16.1.1','192.168.1.1','169.254.2.1','::1','fc00::1'])
    assert.equal(isPublicAddress(ip),false);
});
test('accepts public addresses',()=>{
  for(const ip of ['8.8.8.8','1.1.1.1','2606:4700:4700::1111'])
    assert.equal(isPublicAddress(ip),true);
});
