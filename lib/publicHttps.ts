import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { isPublicAddress } from './publicAddress.ts';

export async function getPublicHttps(hostname: string, path: string, maxBytes: number, timeoutMs: number) {
  let dnsTimeout: NodeJS.Timeout;
  const addresses = await Promise.race([
    lookup(hostname, { all: true, verbatim: true }),
    new Promise<never>((_resolve, reject) => { dnsTimeout = setTimeout(() => reject(Object.assign(new Error('dns_timeout'), { code: 'ETIMEDOUT' })), 1000); }),
  ]).finally(() => clearTimeout(dnsTimeout));
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new Error('non_public_target');
  const address = addresses[0];
  return new Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }>((resolve, reject) => {
    let totalTimeout: NodeJS.Timeout;
    const request = httpsRequest({
      hostname: address.address,
      family: address.family,
      port: 443,
      path,
      method: 'GET',
      servername: hostname,
      headers: { host: hostname, 'user-agent': 'PrompCHAT-installation-check/1.0' },
      checkServerIdentity: (_server, certificate) => checkServerIdentity(hostname, certificate),
      timeout: timeoutMs,
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(totalTimeout);
        resolve({ status: response.statusCode || 0, headers: response.headers, body: Buffer.concat(chunks).toString('utf8') });
      };
      response.on('data', (chunk: Buffer) => {
        if (settled) return;
        const remaining = maxBytes - size;
        const part = chunk.subarray(0, Math.max(remaining, 0));
        if (part.length) chunks.push(part);
        size += chunk.length;
        if (size >= maxBytes) { finish(); response.destroy(); }
      });
      response.on('end', finish);
      response.on('error', (error) => { if (!settled) { settled = true; clearTimeout(totalTimeout); reject(error); } });
    });
    totalTimeout = setTimeout(() => request.destroy(Object.assign(new Error('request_timeout'), { code: 'ETIMEDOUT' })), timeoutMs);
    request.on('timeout', () => request.destroy(Object.assign(new Error('request_timeout'), { code: 'ETIMEDOUT' })));
    request.on('error', (error) => { clearTimeout(totalTimeout); reject(error); });
    request.end();
  });
}
