import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import App from '../../src/App';

const sections = {
  dashboard: 'overview',
  inbox: 'inbox',
  visitors: 'visitors',
  install: 'install',
  integrations: 'api',
  settings: 'settings',
} as const;
const sectionTitles = {
  dashboard: 'ภาพรวม',
  inbox: 'กล่องข้อความ',
  visitors: 'ผู้เยี่ยมชม',
  install: 'ติดตั้งบนเว็บไซต์',
  integrations: 'API & integrations',
  settings: 'ตั้งค่า',
} as const;

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: sectionTitles[section as keyof typeof sectionTitles] ? `${sectionTitles[section as keyof typeof sectionTitles]} | PrompCHAT` : 'PrompCHAT' };
}

export default async function WorkspacePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const initialView = sections[section as keyof typeof sections];
  if (!initialView) notFound();
  return <App initialView={initialView} />;
}
