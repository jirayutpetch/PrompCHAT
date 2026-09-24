import App from '../src/App';
import SupportChatLauncher from '../src/components/SupportChatLauncher';

export default async function Page({ searchParams }: { searchParams: Promise<{ widget?: string }> }) {
  const { widget } = await searchParams;
  return <><App />{widget === '1' ? null : <SupportChatLauncher />}</>;
}
