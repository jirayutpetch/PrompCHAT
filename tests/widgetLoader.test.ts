import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, it } from 'node:test';

const loader = readFileSync(new URL('../public/widget.js', import.meta.url), 'utf8');

function createWidget(search: string) {
  const messages: unknown[] = [];
  const attributes: Record<string, string> = {
    'data-prompchat-workspace': 'workspace-public-id',
    'data-prompchat-launcher': 'custom',
  };
  let onLoad = () => undefined;
  const frame = {
    id: '', title: '', src: '', style: { cssText: '', width: '', height: '', pointerEvents: '' },
    setAttribute() {},
    addEventListener(_event: string, callback: () => void) { onLoad = callback; },
    contentWindow: { postMessage(message: unknown) { messages.push(message); } },
  };
  const appended: unknown[] = [];
  const script = { src: 'https://prompchat.vercel.app/widget.js', getAttribute(name: string) { return attributes[name] || null; }, setAttribute(name: string, value: string) { attributes[name] = value; } };
  const document = {
    currentScript: script,
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() { return frame; },
    head: { appendChild(element: unknown) { appended.push(element); } },
    body: { appendChild(element: unknown) { appended.push(element); } },
  };
  const window = { location: { search }, addEventListener() {} } as Record<string, unknown>;
  runInNewContext(loader, { window, document, URL, URLSearchParams });
  return { frame, messages, appended, open: (window.PrompChatWidget as { open: () => void }).open, onLoad: () => onLoad() };
}

describe('PrompCHAT widget launcher', () => {
  it('automatically opens the support iframe on the support fallback URL', () => {
    const widget = createWidget('?support=1');
    assert.equal(widget.frame.style.width, '380px');
    assert.equal(widget.frame.style.height, '620px');
    widget.onLoad();
    assert.deepEqual(widget.messages.map((message) => (message as { type: string }).type), ['promptchat:open']);
  });

  it('keeps custom-launcher iframes hidden until the host button opens them', () => {
    const widget = createWidget('');
    assert.equal(widget.frame.style.width, '0');
    assert.equal(widget.frame.style.height, '0');
    widget.onLoad();
    assert.deepEqual(widget.messages.map((message) => (message as { type: string }).type), ['promptchat:close']);
    widget.open();
    assert.equal(widget.frame.style.width, '380px');
    assert.equal((widget.messages.at(-1) as { type: string }).type, 'promptchat:open');
  });
});
