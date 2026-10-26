import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

export type ManufacturingReportLogo = { src?: string; warning?: string };
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 5000;
const blockedV4 = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16],
  ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blockedV4.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList(); globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
blockedV6.addSubnet('2001::', 23, 'ipv6');
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');
blockedV6.addSubnet('2002::', 16, 'ipv6');
blockedV6.addSubnet('3fff::', 20, 'ipv6');

export function isPublicReportLogoAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blockedV4.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
}

function inlineLogo(buffer: Buffer): string {
  if (!buffer.length || buffer.length > MAX_BYTES) throw new Error('Invalid logo size');
  let mime = '';
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && buffer.toString('ascii', 12, 16) === 'IHDR') mime = 'image/png';
  else if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) mime = 'image/jpeg';
  else if (buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  else if (['GIF87a', 'GIF89a'].includes(buffer.toString('ascii', 0, 6))) mime = 'image/gif';
  // SVG is embedded as an image, never inserted as HTML. Chromium stays offline
  // and its data-image context does not execute SVG scripts or load subresources.
  else if (/^\s*(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg(?:\s|>)/i.test(buffer.toString('utf8').replace(/^\uFEFF/, ''))) mime = 'image/svg+xml';
  if (!mime) throw new Error('Invalid logo format');
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function publicAddress(url: URL, deadline: number) {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid logo URL');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: Array<{ address: string; family: number }>;
  if (isIP(hostname)) addresses = [{ address: hostname, family: isIP(hostname) }];
  else {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Logo timed out');
    let timer: NodeJS.Timeout | undefined;
    try {
      addresses = await Promise.race([
        dns.lookup(hostname, { all: true, verbatim: true }),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Logo DNS timed out')), remaining); }),
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
  if (!addresses.length || addresses.some(item => !isPublicReportLogoAddress(item.address))) throw new Error('Logo must use a public address');
  // Containers commonly have no IPv6 route even when the host publishes AAAA.
  return addresses.find(item => item.family === 4) || addresses[0];
}

async function downloadLogo(url: URL, deadline: number, redirects = 0): Promise<Buffer> {
  if (redirects > 3) throw new Error('Too many logo redirects');
  const address = await publicAddress(url, deadline);
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Logo timed out');
  const result = await new Promise<Buffer | URL>((resolve, reject) => {
    // Pin the validated address to avoid a second DNS lookup/rebinding. No session
    // headers, cookies or shared connection pool are sent to the branding host.
    const request = (url.protocol === 'https:' ? https : http).get(url, {
      agent: false,
      family: address.family,
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      signal: AbortSignal.timeout(remaining),
      headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', 'Accept-Encoding': 'identity' },
    }, response => {
      response.on('error', reject);
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.destroy();
        try { resolve(new URL(response.headers.location, url)); } catch (error) { reject(error); }
        return;
      }
      const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (response.statusCode !== 200 || !['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'application/octet-stream'].includes(contentType)
        || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')
        || Number(response.headers['content-length'] || 0) > MAX_BYTES) {
        response.destroy(); reject(new Error('Invalid logo response')); return;
      }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) { response.destroy(); reject(new Error('Logo too large')); }
        else chunks.push(chunk);
      });
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('aborted', () => reject(new Error('Logo download aborted')));
    });
    request.on('error', reject);
  });
  return result instanceof URL ? downloadLogo(result, deadline, redirects + 1) : result;
}

export async function manufacturingReportLogo(rawUrl?: string | null): Promise<ManufacturingReportLogo> {
  const value = rawUrl?.trim();
  if (!value) return {};
  try {
    if (value.length > MAX_BYTES * 1.4) throw new Error('Logo too large');
    if (value.startsWith('data:')) {
      const match = /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,([a-z\d+/]+={0,2})$/i.exec(value);
      if (!match) throw new Error('Invalid inline logo');
      return { src: inlineLogo(Buffer.from(match[1], 'base64')) };
    }
    return { src: inlineLogo(await downloadLogo(new URL(value), Date.now() + TIMEOUT_MS)) };
  } catch {
    return { warning: 'Logo del tenant no disponible. Revisa la URL configurada en Branding.' };
  }
}
