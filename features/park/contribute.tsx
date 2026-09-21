'use client';
import { useState } from 'react';
import { Code2, GitPullRequest, Bug, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export function Contribute({ footer = false }: { footer?: boolean }) {
  const [open, setOpen] = useState(false),
    [thanks, setThanks] = useState(false);
  function celebrate() {
    setThanks(true);
  }
  return (
    <>
      {footer ? (
        <a
          href="https://github.com/mjiang4/iwantwaterloo"
          aria-haspopup="dialog"
          onClick={(event) => {
            if (
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            setOpen(true);
          }}
        >
          GitHub
        </a>
      ) : (
        <button
          className="icon-button park-contribute-button"
          aria-label="Help build this park"
          title="Help build this park"
          onClick={() => setOpen(true)}
        >
          <Code2 size={20} />
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="contribute-dialog">
          <DialogTitle>Built together.</DialogTitle>
          <DialogDescription>
            Help make this little park better.
          </DialogDescription>
          <a
            className="contribute-option"
            href="https://github.com/mjiang4/iwantwaterloo/issues"
            target="_blank"
            rel="noreferrer"
            onClick={celebrate}
          >
            <Bug size={20} />
            Suggest a change
          </a>
          <a
            className="contribute-option"
            href="https://github.com/mjiang4/iwantwaterloo"
            target="_blank"
            rel="noreferrer"
            onClick={celebrate}
          >
            <GitPullRequest size={20} />
            Make a pull request
          </a>
          {thanks && (
            <output className="contribute-thanks">
              <Sparkles size={18} />
              Thanks for helping it grow.
              <span aria-hidden="true" className="contribute-cascade">
                {Array.from({ length: 12 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${i * 0.045}s` }} />
                ))}
              </span>
            </output>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
