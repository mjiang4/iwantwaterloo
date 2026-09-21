'use client';
import { useEffect, useState } from 'react';
import { Sparkles, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import landmarks from '@/assets/park/landmarks.json';
import { loadParkProvider, type ParkProvider } from './realism/provider';
export type ParkQuality = 'light' | 'high' | 'realism';
export function QualityPicker({
  quality,
  loading,
  notice,
  onChange,
}: {
  quality: ParkQuality;
  loading: boolean;
  notice: string;
  onChange: (quality: ParkQuality, provider?: ParkProvider) => void;
}) {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ParkProvider | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    if (!open) return;
    let current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    loadParkProvider(controller.signal)
      .then((value) => {
        if (current) setProvider(value);
      })
      .catch(() => {
        if (current) setProvider(null);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (current) setChecking(false);
      });
    return () => {
      current = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open]);
  const connected = !!provider?.googleMapsKey;
  return (
    <div className="park-quality">
      <button
        className="quality-toggle"
        aria-label={
          quality !== 'light'
            ? 'Use light mode'
            : 'Choose realism or high fidelity'
        }
        aria-pressed={quality !== 'light'}
        aria-busy={loading}
        onClick={() => {
          if (quality !== 'light') onChange('light');
          else {
            setChecking(true);
            setOpen(true);
          }
        }}
      >
        {quality !== 'light' ? <Leaf size={16} /> : <Sparkles size={16} />}
        {loading ? 'Loading…' : quality !== 'light' ? 'Light mode' : 'Realism'}
      </button>
      {notice && <output className="quality-notice">{notice}</output>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="quality-dialog">
          <DialogTitle>See the real park.</DialogTitle>
          <DialogDescription>
            Photographic 3D imagery from Google Maps.
          </DialogDescription>
          <p>
            Streams as you explore and uses more graphics power and battery.
          </p>
          {!connected && (
            <p className="quality-hint">
              {checking
                ? 'Checking connection…'
                : 'Realism isn’t connected yet.'}
            </p>
          )}
          <div className="quality-actions">
            <Button
              className="realism-action"
              disabled={!connected || checking}
              onClick={() => {
                if (!provider?.googleMapsKey) return;
                setOpen(false);
                onChange('realism', provider);
              }}
            >
              Enter realism
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Keep it light
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setOpen(false);
                onChange('high');
              }}
            >
              Load detailed model
            </Button>
          </div>
          <p className="quality-hint">
            The detailed model downloads about{' '}
            {Math.ceil(landmarks.detailBytes / 1_000_000)} MB.
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
