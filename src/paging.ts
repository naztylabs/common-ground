import { createHash } from 'node:crypto';

export function page<T>(items: T[], cursor?: string, limit = 10, version = '', maxChars = Infinity) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Page size must be between 1 and 20');
  const fingerprint = createHash('sha256').update(JSON.stringify({version, items})).digest('hex');
  let offset = 0;
  if (cursor) {
    let parsed;
    try { parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString()); }
    catch { throw new Error('Invalid cursor'); }
    if (parsed.fingerprint !== fingerprint) throw new Error('Content changed; restart pagination.');
    offset = parsed.offset;
    if (!Number.isInteger(offset) || offset < 0 || offset > items.length) throw new Error('Invalid cursor');
  }
  let next = offset, size = 0;
  while(next < items.length && next < offset + limit) {
    const length=JSON.stringify(items[next]).length;
    // Always return at least one complete record; never truncate evidence or dependencies.
    if(next > offset && size + length > maxChars)break;
    size += length;next++;
  }
  return {items: items.slice(offset, next), total: items.length,
    nextCursor: next < items.length ? Buffer.from(JSON.stringify({offset: next, fingerprint})).toString('base64url') : null};
}
