import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { isPublicAddress } from '../lib/publicAddress.ts';
import { getPublicHttps } from '../lib/publicHttps.ts';

describe('isPublicAddress', () => {
  it('accepts globally routable IPv4 and IPv6', () => {
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('1.1.1.1'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
    assert.equal(isPublicAddress('::ffff:1.1.1.1'), true);
  });

  it('rejects private, reserved, loopback, and link-local IPv4 ranges', () => {
    for (const address of ['10.1.2.3', '172.16.0.1', '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '224.0.0.1']) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('rejects non-global IPv6 and private IPv4-mapped IPv6', () => {
    for (const address of ['::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '::ffff:192.168.1.1', '2002::1']) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it('rejects malformed addresses', () => {
    assert.equal(isPublicAddress('localhost'), false);
    assert.equal(isPublicAddress('300.1.1.1'), false);
  });

  it('blocks requests to private IPv4 and IPv6 targets before opening HTTPS', async () => {
    await assert.rejects(getPublicHttps('127.0.0.1', '/', 100, 1000), { message: 'non_public_target' });
    await assert.rejects(getPublicHttps('::1', '/', 100, 1000), { message: 'non_public_target' });
  });
});

describe('widget origin migration contract', () => {
  it('checks real PostgREST Origin and Referer headers as well as the workspace-bound host', () => {
    const migration = readFileSync(new URL('../supabase/migrations/0008_widget_request_origin.sql', import.meta.url), 'utf8');
    assert.match(migration, /current_setting\('request\.headers', true\)/);
    assert.match(migration, /request_origin not in/);
    assert.match(migration, /request_referer_origin is not null and request_referer_origin <> request_origin/);
    assert.match(migration, /request_origin_mismatch/);
    assert.match(migration, /target_domain then/);
    assert.match(migration, /grant execute on function public\.initialize_widget_visitor\(text, text\) to authenticated/);
  });
});
