import { env } from 'cloudflare:workers';
import { notFound } from 'next/navigation';
import { OrganizerDesk } from '@/features/organizer/desk';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Organizer · I want Waterloo',
  robots: { index: false, follow: false },
};
export default function OrganizerPage() {
  if (env.GARDEN_ENV !== 'preview') notFound();
  return <OrganizerDesk />;
}
