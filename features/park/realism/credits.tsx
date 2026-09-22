'use client';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
export function RealismCredits({ credits }: { credits: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="realism-credits">
      <span className="google-maps-credit">Google Maps</span>
      <button onClick={() => setOpen(true)}>Data sources</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="quality-dialog">
          <DialogTitle>Data sources</DialogTitle>
          <DialogDescription>
            {credits || 'Google Maps imagery is loading.'}
          </DialogDescription>
          <p>
            Idea trees are community contributions. Their placement uses ©
            OpenStreetMap contributors.
          </p>
          <p>
            <a
              href="https://www.google.com/help/terms_maps/"
              target="_blank"
              rel="noreferrer"
            >
              Google Maps terms
            </a>{' '}
            ·{' '}
            <a
              href="https://policies.google.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Google privacy
            </a>
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
