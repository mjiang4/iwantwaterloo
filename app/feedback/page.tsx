import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { FeedbackForm } from '@/components/feedback-form';
export const metadata = { title: 'Website feedback · I Want Waterloo' };
export default function FeedbackPage() {
  return (
    <main className="feedback-page">
      <Link href="/" className="idea-return">
        <ArrowLeft size={20} aria-hidden="true" />
        Back to garden
      </Link>
      <h1>Help improve this website</h1>
      <FeedbackForm />
    </main>
  );
}
