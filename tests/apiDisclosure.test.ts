import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { POST as retiredBotReply } from '../app/api/bot-reply/route.ts';
import { GET as health } from '../app/api/health/route.ts';
import { POST as verifyInstallation } from '../app/api/verify-installation/route.ts';

describe('public API disclosures', () => {
  it('publishes a security contact in the standard well-known location', () => {
    const securityTxt = readFileSync(new URL('../public/.well-known/security.txt', import.meta.url), 'utf8');
    assert.match(securityTxt, /^Contact: https:\/\/prompchat\.vercel\.app\/\?support=1$/m);
    assert.match(securityTxt, /^Preferred-Languages: en, th$/m);
    assert.match(securityTxt, /^Expires: 2027-09-24T00:00:00\.000Z$/m);
  });

  it('reports the health endpoint accurately', async () => {
    const response = await health();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/json');
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.service, 'PrompCHAT');
  });

  it('rejects the retired public bot-reply endpoint without running caller-supplied rules', async () => {
    const response = await retiredBotReply();
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.equal(payload.error, 'endpoint_retired');
    assert.match(payload.message, /ไม่รับ triggers ที่ผู้เรียกส่งมาเอง/);
  });

  it('requires an authenticated owner before installation verification', async () => {
    const response = await verifyInstallation(new Request('https://prompchat.vercel.app/api/verify-installation', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json()).reason, 'authentication_required');
  });

  it('rejects oversized installation verification payloads before reading them', async () => {
    const response = await verifyInstallation(new Request('https://prompchat.vercel.app/api/verify-installation', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json', 'content-length': '8193' },
      body: '{}',
    }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).reason, 'request_too_large');
  });

  it('limits streaming installation payloads even when content-length is omitted', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(8193)); controller.close(); },
    });
    const response = await verifyInstallation(new Request('https://prompchat.vercel.app/api/verify-installation', {
      method: 'POST',
      headers: { authorization: 'Bearer test', 'content-type': 'application/json' },
      body,
      // Chunked requests may omit Content-Length; the stream still has to be bounded.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }));
    assert.equal(response.status, 413);
    assert.equal((await response.json()).reason, 'request_too_large');
  });
});
