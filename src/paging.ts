import { createHash } from 'node:crypto';

export function page<T>(items: T[], cursor?: string, limit = 10, version = '') {
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
  const next = offset + limit;
  return {items: items.slice(offset, next), total: items.length,
    nextCursor: next < items.length ? Buffer.from(JSON.stringify({offset: next, fingerprint})).toString('base64url') : null};
}
