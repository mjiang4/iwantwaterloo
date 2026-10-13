'use client';
import { useState } from 'react';
import { requestJSON } from '@/lib/client';

/** Same quiet flow as "Report this idea": one tap, then a short confirmation. */
export function ReportLove({ loveId }: { loveId: string }) {
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <>
      <button
        type="button"
        className="report-love"
        disabled={sent}
        onClick={async () => {
          try {
            await requestJSON('/api/reports', {
              method: 'POST',
              body: JSON.stringify({
                loveId,
                reason: 'Please review this love.',
              }),
            });
            setSent(true);
            setMessage('Thanks. This was flagged for review.');
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : 'Couldn’t send the report.',
            );
          }
        }}
      >
        Report
      </button>
      <output className="report-love-message">{message}</output>
    </>
  );
}
