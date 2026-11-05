import {test} from 'node:test';
import assert from 'node:assert/strict';
import {youtubeVideoId,isYouTube} from '../public/youtube.js';
test('supports official YouTube watch, short and share links',()=>{
  for(const raw of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ','https://m.youtube.com/shorts/dQw4w9WgXcQ']){
    assert.equal(youtubeVideoId(new URL(raw)),'dQw4w9WgXcQ');
  }
});
test('does not treat lookalike domains or malformed video IDs as videos',()=>{
  for(const raw of ['https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ','https://www.youtube.com/watch?v=invalid','https://youtube.com/']){
    assert.equal(youtubeVideoId(new URL(raw)),null);
  }
  assert.equal(isYouTube(new URL('https://youtube.com.evil.example')),false);
});

test('host UI explicitly allows YouTube official embeds and serves helper',()=>{
  // Keep the iframe provider policy and frontend module route in sync.
  return import('node:fs').then(fs=>{
    const source=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
    assert.match(source,/frame-src 'self' https:\/\/www\.youtube\.com/);
    assert.match(source,/incoming\.pathname === '\/youtube\.js'/);
  });
});
