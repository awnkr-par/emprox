import dns from 'node:dns';
import net from 'node:net';

const allow = new Set((process.env.ALLOWED_HOSTS || 'example.com,example.org')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean));

export function allowedHosts() { return [...allow]; }

export function isPublicAddress(ip) {
  const version = net.isIP(ip);
  if (!version) return false;
  if (version === 4) {
    const n = ip.split('.').map(Number);
    const [a,b,c] = n;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 || a === 100 && b >= 64 && b <= 127 ||
      a === 192 && b === 0 && c === 0 || a === 192 && b === 0 && c === 2 ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113 ||
      a === 255 || a === 192 && b === 88 && c === 99);
  }
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') ||
      lower.startsWith('fc') || lower.startsWith('fd') ||
      lower.startsWith('ff') || lower.startsWith('2001:db8:')) return false;
  // IPv4-mapped IPv6 and other unusual forms are not accepted.
  return !lower.includes('.') && !lower.startsWith('::ffff:');
}

export function parseTarget(raw, base) {
  if (typeof raw !== 'string' || raw.length > 4096) throw new Error('Invalid URL');
  let url;
  try { url = new URL(raw, base); } catch { throw new Error('Invalid URL'); }
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs are allowed');
  if (url.username || url.password || url.port && !['80','443'].includes(url.port))
    throw new Error('Credentials and custom ports are disabled');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!allow.has(host) || net.isIP(host) || host === 'localhost')
    throw new Error('Host not on the allowlist');
  url.hash = '';
  return url;
}

export function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    // Do not connect to any address if even one DNS response is private.
    if (!addresses?.length || addresses.some(a => !isPublicAddress(a.address))) {
      return callback(new Error('Upstream DNS returned a disallowed address'));
    }
    const a = addresses[0];
    callback(null, a.address, a.family);
  });
}
