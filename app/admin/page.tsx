import { GardenAdmin } from '@/components/garden-admin';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Admin · I Want Waterloo',
  robots: { index: false, follow: false },
  referrer: 'no-referrer' as const,
};
export default function AdminPage() {
  return <GardenAdmin />;
}
