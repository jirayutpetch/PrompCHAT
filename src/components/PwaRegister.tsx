'use client';

import { useEffect, useState } from 'react';

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

export default function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isWidget, setIsWidget] = useState(false);
  useEffect(() => {
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    setIsWidget(window.location.search.includes('widget=1'));
    if ('serviceWorker' in navigator && window.location.search.indexOf('widget=1') === -1) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);
    const handleInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPrompt); };
    const handleInstalled = () => { setInstalled(true); setInstallPrompt(null); };
    window.addEventListener('beforeinstallprompt', handleInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => { window.removeEventListener('beforeinstallprompt', handleInstall); window.removeEventListener('appinstalled', handleInstalled); };
  }, []);

  if (installed || isWidget) return null;
  if (!installPrompt && !isIos) return null;

  async function install() {
    if (!installPrompt) { setShowIosHelp((value) => !value); return; }
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') setInstalled(true);
    setInstallPrompt(null);
  }

  return <aside className="pwa-install-card" aria-label="ติดตั้ง PrompCHAT">
    <button className="pwa-install-action" onClick={() => void install()}>{isIos ? 'เพิ่ม PrompCHAT ลงหน้าจอหลัก' : 'ติดตั้งแอป PrompCHAT'}</button>
    {showIosHelp && <p>แตะปุ่มแชร์ใน Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม”</p>}
  </aside>;
}
