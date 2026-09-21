'use client';
import { useState } from 'react';
import { Sparkles, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import landmarks from '@/assets/park/landmarks.json';
export type ParkQuality = 'light' | 'high';
export function QualityPicker({
  quality,
  loading,
  notice,
  onChange,
}: {
  quality: ParkQuality;
  loading: boolean;
  notice: string;
  onChange: (quality: ParkQuality) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="park-quality">
      <button
        className="quality-toggle"
        aria-label={quality === 'high' ? 'Use light mode' : 'Try high fidelity'}
        aria-pressed={quality === 'high'}
        aria-busy={loading}
        onClick={() => (quality === 'high' ? onChange('light') : setOpen(true))}
      >
        {quality === 'high' ? <Leaf size={16} /> : <Sparkles size={16} />}
        {loading
          ? 'Loading detail…'
          : quality === 'high'
            ? 'Light mode'
            : 'High fidelity'}
      </button>
      {notice && <output className="quality-notice">{notice}</output>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="quality-dialog">
          <DialogTitle>A closer look.</DialogTitle>
          <DialogDescription>
            Detailed foliage, architecture and water reflections.
          </DialogDescription>
          <p>
            Downloads about {Math.ceil(landmarks.detailBytes / 1_000_000)} MB
            and uses more graphics power and battery. Phones may feel slower or
            warmer.
          </p>
          <p className="quality-hint">
            You can switch back to Light at any time.
          </p>
          <div className="quality-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it light
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                onChange('high');
              }}
            >
              Load high fidelity
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
