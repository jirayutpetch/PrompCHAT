'use client';

import { useEffect } from 'react';
import avatar from '../assets/images/prompchat-avatar.png';

export default function SupportChatLauncher() {
  useEffect(() => {
    if (document.getElementById('prompchat-support-script')) return;
    const script = document.createElement('script');
    script.id = 'prompchat-support-script';
    script.src = `${window.location.origin}/widget.js`;
    script.async = true;
    script.setAttribute('data-prompchat-workspace', 'a68157ad70d5fbd7601cf69f7b2fb85f');
    script.setAttribute('data-prompchat-domain', window.location.hostname);
    script.setAttribute('data-prompchat-launcher', 'custom');
    document.body.appendChild(script);
    return () => { script.remove(); document.getElementById('promptchat-widget-frame')?.remove(); };
  }, []);

  function openSupport() {
    const widget = window as Window & { PrompChatWidget?: { open: () => void } };
    if (widget.PrompChatWidget) { widget.PrompChatWidget.open(); return; }
    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    const destination = isLocal ? new URL('https://prompchat.vercel.app/') : new URL(window.location.href);
    destination.searchParams.set('support', '1');
    window.open(destination.toString(), '_blank', 'noopener,noreferrer');
  }

  return <button className="main-support-launcher" onClick={openSupport} aria-label="เปิดแชทกับทีมงาน PrompCHAT" title="คุยกับทีมงาน"><img src={avatar.src} alt="" /></button>;
}
