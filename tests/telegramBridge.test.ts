import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomBytes } from 'node:crypto';
import { decryptBotToken, encryptBotToken, hashSecret, matchesSecret } from '../lib/telegramServer.ts';

describe('workspace Telegram bridge safety', () => {
  it('encrypts each workspace bot token and detects tampering', () => {
    const previous = process.env.PROMPCHAT_TELEGRAM_ENCRYPTION_KEY;
    process.env.PROMPCHAT_TELEGRAM_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    try {
      const token = '123456789:abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMN';
      const encrypted = encryptBotToken(token);
      assert.ok(!encrypted.includes(token));
      assert.equal(decryptBotToken(encrypted), token);
      assert.throws(() => decryptBotToken(encrypted.slice(0, -2) + 'AA'));
    } finally {
      if (previous === undefined) delete process.env.PROMPCHAT_TELEGRAM_ENCRYPTION_KEY;
      else process.env.PROMPCHAT_TELEGRAM_ENCRYPTION_KEY = previous;
    }
  });

  it('validates webhook secrets without accepting malformed headers', () => {
    const secret = randomBytes(32).toString('base64url');
    assert.equal(matchesSecret(secret, hashSecret(secret)), true);
    assert.equal(matchesSecret(secret + 'x', hashSecret(secret)), false);
    assert.equal(matchesSecret('', hashSecret(secret)), false);
  });

});
