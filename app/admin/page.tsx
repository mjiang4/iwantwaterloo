import { env } from 'cloudflare:workers';
import { notFound, redirect } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default function AdminPage() {
  if (env.GARDEN_ENV === 'preview') redirect('/');
  if (import.meta.env.DEV) redirect('http://localhost:3001/');
  notFound();
}
