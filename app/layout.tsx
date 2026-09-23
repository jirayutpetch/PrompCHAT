import type { Metadata, Viewport } from 'next';
import './globals.css';
import PwaRegister from '../src/components/PwaRegister';

export const metadata: Metadata = {
  title: 'PromptCHAT — Live chat สำหรับเว็บไซต์',
  description: 'ระบบแชตสดสำหรับเว็บไซต์ พร้อม workspace ให้ทีมตอบลูกค้าได้ทันที',
  icons: { icon: '/favicon.svg' },
};

export const viewport: Viewport = { themeColor: '#0b1219', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body><PwaRegister />{children}</body></html>;
}
