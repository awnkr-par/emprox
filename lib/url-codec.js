// URL-safe Base64 for compact navigation links. NOT encryption or filter evasion.
export function encodeUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 4096 || !raw) throw new Error('Invalid URL');
  return Buffer.from(raw, 'utf8').toString('base64url');
}
export function decodeUrl(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8192)
    throw new Error('Invalid encoded URL');
  const decoded = Buffer.from(value, 'base64url').toString('utf8');
  if (!decoded || decoded.length > 4096 || encodeUrl(decoded) !== value)
    throw new Error('Invalid encoded URL');
  return decoded;
}
export function getTargetParam(params) {
  if (params.has('u')) return decodeUrl(params.get('u'));
  if (params.has('url')) return params.get('url'); // Backward compatible
  throw new Error('Missing destination URL');
}
