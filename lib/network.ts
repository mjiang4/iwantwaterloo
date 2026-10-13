/**
 * The caller's network for abuse limits. Cloudflare supplies the connecting IP in
 * production; raw addresses are never stored. IPv6 is grouped by its /64 prefix,
 * since one host typically controls a whole /64 and could otherwise rotate
 * addresses to get fresh limits.
 */
export function clientNetwork(request: Request) {
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) return null;
  if (!ip.includes(':')) return ip;
  // IPv4-mapped IPv6 (::ffff:203.0.113.7) is one IPv4 client.
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = [
    ...left,
    ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'),
    ...right,
  ];
  return (
    groups
      .slice(0, 4)
      .map((g) => g.replace(/^0+(?=.)/, ''))
      .join(':') + '::/64'
  );
}
