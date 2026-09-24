(function () {
  var script = document.currentScript;
  if (!script || document.getElementById('promptchat-widget-frame')) return;

  var origin = new URL(script.src, window.location.href).origin;
  script.setAttribute('data-prompchat-technology', 'live-chat');
  if (!document.querySelector('meta[name="prompchat:technology"]')) {
    var technology = document.createElement('meta');
    technology.name = 'prompchat:technology';
    technology.content = 'PrompCHAT Live Chat';
    document.head.appendChild(technology);
  }
  var workspace = script.getAttribute('data-prompchat-workspace') || script.getAttribute('data-promptchat-workspace') || script.getAttribute('data-workspace') || 'default';
  var customLauncher = (script.getAttribute('data-prompchat-launcher') || script.getAttribute('data-promptchat-launcher')) === 'custom';
  var frame = document.createElement('iframe');
  var ready = false;
  var requestedOpen = !customLauncher;
  function setFrameOpen(open) {
    requestedOpen = open;
    frame.style.width = open ? '380px' : customLauncher ? '0' : '82px';
    frame.style.height = open ? '620px' : customLauncher ? '0' : '82px';
    frame.style.pointerEvents = open || !customLauncher ? 'auto' : 'none';
  }
  window.PrompChatWidget = {
    technology: 'PrompCHAT Live Chat',
    version: '1.0.0',
    workspace: workspace,
    open: function () { setFrameOpen(true); if (ready && frame.contentWindow) frame.contentWindow.postMessage({ type: 'promptchat:open' }, origin); },
    close: function () { setFrameOpen(false); if (ready && frame.contentWindow) frame.contentWindow.postMessage({ type: 'promptchat:close' }, origin); },
    toggle: function () { requestedOpen ? this.close() : this.open(); }
  };
  window.PromptChatWidget = window.PrompChatWidget;
  frame.id = 'promptchat-widget-frame';
  frame.title = 'PrompCHAT live chat';
  frame.src = origin + '/?widget=1&workspace=' + encodeURIComponent(workspace) + (customLauncher ? '&launcher=custom' : '');
  frame.setAttribute('data-promptchat-widget', '1');
  frame.setAttribute('allow', 'clipboard-write');
  frame.style.cssText = 'position:fixed;right:18px;bottom:18px;width:380px;height:620px;border:0;background:transparent;z-index:2147483000;pointer-events:auto;';
  if (customLauncher) setFrameOpen(false);
  frame.addEventListener('load', function () {
    ready = true;
    if (frame.contentWindow) frame.contentWindow.postMessage({ type: requestedOpen ? 'promptchat:open' : 'promptchat:close' }, origin);
  });

  function resize(event) {
    if (event.source !== frame.contentWindow || !event.data || event.data.type !== 'promptchat:resize') return;
    setFrameOpen(!!event.data.open);
  }

  window.addEventListener('message', resize);
  document.body.appendChild(frame);
})();
