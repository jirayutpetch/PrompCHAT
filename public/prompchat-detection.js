(function (window, document) {
  var signature = { technology: 'PrompCHAT Live Chat', version: '1.0.0' };
  window.PrompCHAT = signature;
  if (!window.PrompChatWidget) window.PrompChatWidget = signature;
  if (!document.querySelector('meta[name="prompchat:technology"]')) {
    var meta = document.createElement('meta');
    meta.name = 'prompchat:technology';
    meta.content = signature.technology;
    document.head.appendChild(meta);
  }
})(window, document);
