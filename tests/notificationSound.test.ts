import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectVisitorMessageIds, hasUnseenVisitorMessage } from '../src/services/notificationSound.ts';

describe('incoming message sound detection', () => {
  it('does not play for messages already present on initial load', () => {
    const conversations = [{ messages: [{ id: 'old-1', sender: 'visitor' }] }];
    assert.equal(hasUnseenVisitorMessage(conversations, null), false);
  });

  it('plays for a new visitor message but ignores agent replies', () => {
    const seen = new Set(['old-1']);
    const conversations = [{ messages: [
      { id: 'old-1', sender: 'visitor' },
      { id: 'agent-1', sender: 'agent' },
      { id: 'new-1', sender: 'visitor' },
    ] }];
    assert.equal(hasUnseenVisitorMessage(conversations, seen), true);
  });

  it('does not play again after the visitor message ID has been observed', () => {
    const conversations = [{ messages: [{ id: 'new-1', sender: 'visitor' }] }];
    assert.equal(hasUnseenVisitorMessage(conversations, collectVisitorMessageIds(conversations)), false);
  });
});
