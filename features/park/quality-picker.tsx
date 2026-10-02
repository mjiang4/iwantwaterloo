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
        aria-label={
          quality !== 'light' ? 'Use light mode' : 'Choose high fidelity'
        }
        aria-pressed={quality !== 'light'}
        aria-busy={loading}
        onClick={() => {
          if (quality !== 'light') onChange('light');
          else setOpen(true);
        }}
      >
        {quality !== 'light' ? <Leaf size={16} /> : <Sparkles size={16} />}
        <span className="quality-label">
          {loading ? 'Loading…' : quality !== 'light' ? 'Light mode' : 'Detail'}
        </span>
      </button>
      {notice && <output className="quality-notice">{notice}</output>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="quality-dialog">
          <DialogTitle>See the park in detail.</DialogTitle>
          <DialogDescription>
            A richer model of Waterloo Park and its landmarks.
          </DialogDescription>
          <div className="quality-actions">
            <Button
              onClick={() => {
                setOpen(false);
                onChange('high');
              }}
            >
              Load detailed model
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it light
            </Button>
          </div>
          <p>It uses more data and battery than light mode.</p>
          <p className="quality-hint">
            The detailed model downloads about{' '}
            {Math.ceil(landmarks.detailBytes / 1_000_000)} MB.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
