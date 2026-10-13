'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Contribute } from './contribute';
import { setParkFull, useIsPhone, useParkFull } from './tier';

/** One header menu for secondary destinations, so the park itself stays uncluttered. */
export function ParkMenu({
  onHowItWorks,
  onAbout,
}: {
  onHowItWorks: () => void;
  onAbout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const phone = useIsPhone();
  const full = useParkFull();
  const close = (then: () => void) => () => {
    setOpen(false);
    then();
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="icon-button park-menu-trigger"
        aria-label="Menu"
        title="Menu"
      >
        <Menu size={19} />
      </PopoverTrigger>
      <PopoverContent className="park-menu" align="end" sideOffset={10}>
        <PopoverTitle className="sr-only">Menu</PopoverTitle>
        <nav aria-label="Site">
          <button type="button" onClick={close(onHowItWorks)}>
            How it works
          </button>
          <Link prefetch={false} href="/updates" onClick={() => setOpen(false)}>
            Updates
          </Link>
          <Link href="/feedback" onClick={() => setOpen(false)}>
            Website feedback
          </Link>
          <button type="button" onClick={close(onAbout)}>
            About and privacy
          </button>
          {phone && (
            <button type="button" onClick={close(() => setParkFull(!full))}>
              {full ? 'Use lighter version' : 'Use full version'}
            </button>
          )}
          <Contribute footer label="Help build this park" />
        </nav>
      </PopoverContent>
    </Popover>
  );
}
