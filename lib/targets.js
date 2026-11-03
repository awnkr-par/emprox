import dns from 'node:dns';
import net from 'node:net';

// Public websites are permitted by default. BLOCKED_HOSTS supplements the
// conservative keyword screen; neither method is comprehensive content moderation.
const blocked = new Set((process.env.BLOCKED_HOSTS || '')
  .split(',').map(x => x.trim().toLowerCase().replace(/^\.+|\.+$/g, '')).filter(Boolean));
const blockedLabels = new Set(['porn','xxx','hentai','gore','guro','nsfw','adult']);
export function isBlockedHost(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if ([...blocked].some(domain => host === domain || host.endsWith('.' + domain))) return true;
  return host.split('.').some(label => blockedLabels.has(label));
}
export function blockedHosts() { return [...blocked]; }

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
  if (net.isIP(host) || host === 'localhost' || !host.includes('.') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      host.endsWith('.localhost') || host.endsWith('.test') ||
      host.endsWith('.invalid') || host.endsWith('.onion'))
    throw new Error('Only public DNS hostnames are allowed');
  if (isBlockedHost(host))
    throw new Error('This domain is blocked by EmProx content settings');
  url.hash = '';
  return url;
}

export function deliverLookupResult(options, callback, addresses) {
  if (options?.all) return callback(null, addresses);
  const first = addresses[0];
  return callback(null, first.address, first.family);
}

export function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) return callback(err);
    // Do not connect to any address if even one DNS response is private.
    if (!addresses?.length || addresses.some(a => !isPublicAddress(a.address))) {
      return callback(new Error('Upstream DNS returned a disallowed address'));
    }
    // Preserve Node's expected return shape for each lookup mode.
    return deliverLookupResult(options, callback, addresses);
  });
}
