// Official YouTube embed routing. It does not proxy or disguise YouTube traffic.
export function youtubeVideoId(url) {
  const host=url.hostname.toLowerCase();
  let id=null;
  if(host==='youtu.be') id=url.pathname.split('/')[1]||null;
  if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)) {
    if(url.pathname==='/watch') id=url.searchParams.get('v');
    else {
      const pieces=url.pathname.split('/').filter(Boolean);
      if(['shorts','live','embed'].includes(pieces[0])) id=pieces[1]||null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
export function isYouTube(url) {
  return ['youtu.be','youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname.toLowerCase());
}
