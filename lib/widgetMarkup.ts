type WidgetMarkupCheck = {
  embedIdFound: boolean;
  scriptFound: boolean;
  domainMismatch: boolean;
  wrongScriptSource: boolean;
};

function readAttributes(tag: string) {
  return new Map(Array.from(tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g), (match) =>
    [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? ''],
  ));
}

function normalizeHost(value: string) {
  return value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0].replace(/\\\./g, '.').replace(/\.$/, '');
}

export function inspectWidgetMarkup(html: string, embedKey: string, widgetOrigin: string, expectedDomain: string): WidgetMarkupCheck {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*>/gi), (match) => readAttributes(match[0]));
  const candidates = scripts.filter((attrs) =>
    ['data-prompchat-workspace', 'data-promptchat-workspace', 'data-workspace'].some((name) => attrs.get(name) === embedKey),
  );
  const scriptFound = candidates.some((attrs) => {
    const source = attrs.get('src');
    if (!source) return false;
    try {
      const parsed = new URL(source, `https://${normalizeHost(expectedDomain)}/`);
      return parsed.origin === widgetOrigin && parsed.pathname === '/widget.js';
    } catch { return false; }
  });
  const normalizedExpected = normalizeHost(expectedDomain);
  const domainMismatch = candidates.some((attrs) => {
    const suppliedDomain = attrs.get('data-prompchat-domain') || attrs.get('data-promptchat-domain') || attrs.get('data-domain');
    return !!suppliedDomain && normalizeHost(suppliedDomain) !== normalizedExpected;
  });
  return { embedIdFound: candidates.length > 0, scriptFound, domainMismatch, wrongScriptSource: candidates.length > 0 && !scriptFound };
}
