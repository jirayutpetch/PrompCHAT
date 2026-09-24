import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inspectWidgetMarkup } from '../lib/widgetMarkup.ts';

const embedKey = 'd889d06576bc0f78a5cf8a5c9aa64a13';
const appOrigin = 'https://prompchat.vercel.app';

describe('installation HTML verification', () => {
  it('accepts the correct PrompCHAT loader, workspace ID, and domain', () => {
    const html = `<script async src="${appOrigin}/widget.js" data-prompchat-workspace="${embedKey}" data-prompchat-domain="shop.example.com"></script>`;
    assert.deepEqual(inspectWidgetMarkup(html, embedKey, appOrigin, 'shop.example.com'), {
      embedIdFound: true, scriptFound: true, domainMismatch: false, wrongScriptSource: false,
    });
  });

  it('does not mark a copied ID on an unrelated script as installed', () => {
    const html = `<script src="https://attacker.example/widget.js" data-prompchat-workspace="${embedKey}"></script>`;
    assert.deepEqual(inspectWidgetMarkup(html, embedKey, appOrigin, 'shop.example.com'), {
      embedIdFound: true, scriptFound: false, domainMismatch: false, wrongScriptSource: true,
    });
  });

  it('reports a configured domain mismatch even when the loader is correct', () => {
    const html = `<script src="${appOrigin}/widget.js" data-workspace="${embedKey}" data-domain="other.example.com"></script>`;
    assert.deepEqual(inspectWidgetMarkup(html, embedKey, appOrigin, 'shop.example.com'), {
      embedIdFound: true, scriptFound: true, domainMismatch: true, wrongScriptSource: false,
    });
  });

  it('rejects an ID embedded in inline JavaScript without a loader script', () => {
    const html = `<script>const workspace = '${embedKey}'</script>`;
    assert.deepEqual(inspectWidgetMarkup(html, embedKey, appOrigin, 'shop.example.com'), {
      embedIdFound: false, scriptFound: false, domainMismatch: false, wrongScriptSource: false,
    });
  });
});
