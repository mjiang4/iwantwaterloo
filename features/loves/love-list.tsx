'use client';
import { useState } from 'react';
import { Heart, Plus } from 'lucide-react';
import { useLoveEcho, useLoves } from './queries';
import { LoveComposer } from './love-composer';
import { ReportLove } from './report-love';

/**
 * Loves in the list view: the readable, non-WebGL counterpart to the flowers in
 * the park, shown beside the ideas they contrast with. A love can be added here
 * by choosing a place, so the list never depends on the 3D scene.
 */
export function LoveList() {
  const loves = useLoves();
  const { echo, pending, error } = useLoveEcho();
  const [composing, setComposing] = useState(false);
  const items = loves.data?.loves ?? [];
  return (
    <section
      className="love-list"
      aria-label="Things people love about Waterloo"
    >
      <div className="love-list-head">
        <h2>I love Waterloo for…</h2>
        <button
          type="button"
          className="love-add"
          onClick={() => setComposing(true)}
        >
          <Plus size={15} aria-hidden="true" />
          Add a love
        </button>
      </div>
      {/* A failed refresh keeps the loves already shown; only an empty first load reports it. */}
      {loves.isError && (
        <p className="form-error" role="alert">
          {items.length ? 'Couldn’t refresh loves.' : 'Couldn’t load loves.'}{' '}
          <button type="button" onClick={() => void loves.refetch()}>
            Retry
          </button>
        </p>
      )}
      {items.length > 0 && (
        <ul>
          {items.map((love) => (
            <li key={love.id} className="love-card">
              <blockquote>{love.body}</blockquote>
              {love.displayName && (
                <p className="love-card-by">{love.displayName}</p>
              )}
              <div className="love-card-actions">
                <button
                  type="button"
                  className="love-echo"
                  aria-pressed={love.echoed}
                  aria-label={`Me too: ${love.body}. ${love.echoes} ${love.echoes === 1 ? 'person agrees' : 'people agree'}`}
                  disabled={pending.has(love.id)}
                  onClick={() => void echo(love)}
                >
                  <Heart
                    size={15}
                    fill={love.echoed ? 'currentColor' : 'none'}
                    aria-hidden="true"
                  />
                  Me too{love.echoes ? ` · ${love.echoes}` : ''}
                </button>
                <ReportLove loveId={love.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {composing && (
        <LoveComposer
          spot={{ choose: true }}
          onClose={() => setComposing(false)}
          onPosted={() => setComposing(false)}
        />
      )}
    </section>
  );
}
