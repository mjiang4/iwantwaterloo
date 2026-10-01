'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trash2, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Idea = {
  id: string;
  title: string;
  description: string;
  displayName: string | null;
  place: string;
  likes: number;
  comments: number;
};
type Member = { email: string; owner: boolean };
class AdminError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function call<T>(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<T> {
  const r = await fetch('/api/manage/' + path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers:
      body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw new AdminError(
      data.error || 'Couldn’t complete that action.',
      r.status,
    );
  return data;
}
export function GardenAdmin() {
  const [email, setEmail] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [input, setInput] = useState(''),
    [link, setLink] = useState('');
  const [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'ideas' | 'admins'>('ideas'),
    [ideas, setIdeas] = useState<Idea[]>([]),
    [admins, setAdmins] = useState<Member[]>([]);
  const [query, setQuery] = useState(''),
    [next, setNext] = useState<number | null>(null),
    [confirm, setConfirm] = useState<Idea | null>(null),
    [remove, setRemove] = useState<string | null>(null);
  function fail(e: unknown) {
    setError(e instanceof Error ? e.message : 'Couldn’t complete that action.');
    if (e instanceof AdminError && e.status === 401) setEmail(null);
  }
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get(
      'token',
    );
    if (token) {
      setLink(token);
      history.replaceState(null, '', location.pathname);
    }
    call<{ email: string }>('session')
      .then((v) => setEmail(v.email))
      .catch((e) => {
        if (!(e instanceof AdminError && e.status === 401)) fail(e);
      })
      .finally(() => setLoading(false));
  }, []);
  async function loadIdeas(offset = 0) {
    const r = await call<{ ideas: Idea[]; nextOffset: number | null }>(
      'ideas?' + new URLSearchParams({ q: query, offset: String(offset) }),
    );
    setIdeas((old) => (offset ? [...old, ...r.ideas] : r.ideas));
    setNext(r.nextOffset);
  }
  async function loadAdmins() {
    const r = await call<{ admins: Member[] }>('members');
    setAdmins(r.admins);
  }
  useEffect(() => {
    if (!email) return;
    let active = true;
    setLoading(true);
    Promise.all([
      call<{ ideas: Idea[]; nextOffset: number | null }>('ideas'),
      call<{ admins: Member[] }>('members'),
    ])
      .then(([a, b]) => {
        if (active) {
          setIdeas(a.ideas);
          setNext(a.nextOffset);
          setAdmins(b.admins);
        }
      })
      .catch((e) => {
        if (active) fail(e);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [email]);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="garden-admin">
      <Link href="/" className="admin-back">
        <ArrowLeft size={17} /> Back to garden
      </Link>
      <header>
        <h1>Garden admin</h1>
        {email && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await call('session', 'DELETE', {});
                setEmail(null);
                setIdeas([]);
                setAdmins([]);
                setInput('');
                setLink('');
              })
            }
          >
            <LogOut size={16} />
            Sign out
          </Button>
        )}
      </header>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="admin-notice" role="status">
          {notice}
        </p>
      )}
      {loading && !email ? (
        <p role="status">Loading…</p>
      ) : !email ? (
        <section className="admin-login">
          {link ? (
            <>
              <h2>Sign in to your garden</h2>
              <p>Continue using the link from your email.</p>
              <Button
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    const r = await call<{ email: string }>('session', 'POST', {
                      token: link,
                    });
                    setLink('');
                    setEmail(r.email);
                  })
                }
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setLink('');
                  setError('');
                }}
              >
                Use another email
              </Button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act(async () => {
                  const r = await call<{ message: string }>('login', 'POST', {
                    email: input,
                  });
                  setNotice(r.message);
                });
              }}
            >
              <label htmlFor="admin-email">Admin email</label>
              <Input
                id="admin-email"
                type="email"
                autoComplete="email"
                required
                value={input}
                disabled={busy}
                onChange={(e) => setInput(e.target.value)}
              />
              <Button type="submit" disabled={busy}>
                {busy ? 'Sending…' : 'Email me a sign-in link'}
              </Button>
              <p>Access is limited to approved admins.</p>
            </form>
          )}
        </section>
      ) : (
        <>
          <p className="admin-identity">{email}</p>
          <nav aria-label="Admin sections">
            <Button
              variant={tab === 'ideas' ? 'default' : 'ghost'}
              onClick={() => setTab('ideas')}
            >
              Ideas
            </Button>
            <Button
              variant={tab === 'admins' ? 'default' : 'ghost'}
              onClick={() => setTab('admins')}
            >
              Admins
            </Button>
          </nav>
          {loading ? (
            <p role="status">Loading…</p>
          ) : tab === 'ideas' ? (
            <>
              <form
                className="admin-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(() => loadIdeas());
                }}
              >
                <Input
                  aria-label="Search ideas"
                  placeholder="Search ideas"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <Button disabled={busy} type="submit" variant="outline">
                  Search
                </Button>
              </form>
              {ideas.length === 0 && !error && <p>No ideas found.</p>}
              {ideas.map((idea) => (
                <article className="admin-idea" key={idea.id}>
                  <p className="admin-idea-body">{idea.description}</p>
                  <p className="admin-meta">
                    {[
                      idea.displayName,
                      idea.place || 'Waterloo',
                      `${idea.likes} likes`,
                      `${idea.comments} replies`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                  {confirm?.id === idea.id ? (
                    <div
                      className="admin-confirm"
                      role="group"
                      aria-label="Confirm deletion"
                    >
                      <p>
                        Delete this idea and its likes and replies? This cannot
                        be undone.
                      </p>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setConfirm(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="admin-danger"
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await call('ideas', 'DELETE', {
                              id: idea.id,
                              confirm: true,
                            });
                            setIdeas((items) =>
                              items.filter((i) => i.id !== idea.id),
                            );
                            setConfirm(null);
                            setNotice('Idea deleted.');
                          })
                        }
                      >
                        Delete idea
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setConfirm(idea)}
                      aria-label={`Delete ${idea.title}`}
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  )}
                </article>
              ))}
              {next !== null && (
                <Button
                  disabled={busy}
                  onClick={() => act(() => loadIdeas(next))}
                >
                  Load more
                </Button>
              )}
            </>
          ) : (
            <section className="admin-members">
              <h2>Who can manage the garden</h2>
              <p>Admins can delete ideas and manage access.</p>
              {admins.map((member) => (
                <div className="admin-member" key={member.email}>
                  <span>
                    {member.email}
                    {member.owner && <small>Owner</small>}
                  </span>
                  {!member.owner &&
                    member.email !== email &&
                    (remove === member.email ? (
                      <span>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setRemove(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          disabled={busy}
                          onClick={() =>
                            act(async () => {
                              await call('members', 'DELETE', {
                                email: member.email,
                              });
                              await loadAdmins();
                              setRemove(null);
                              setNotice('Admin access removed.');
                            })
                          }
                        >
                          Confirm removal
                        </Button>
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setRemove(member.email)}
                      >
                        Remove
                      </Button>
                    ))}
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await call('members', 'POST', { email: input });
                    await loadAdmins();
                    setInput('');
                    setNotice(
                      'Admin added. They can request a sign-in link at /admin.',
                    );
                  });
                }}
              >
                <label htmlFor="new-admin">Add an admin</label>
                <div className="admin-search">
                  <Input
                    id="new-admin"
                    type="email"
                    autoComplete="off"
                    required
                    value={input}
                    disabled={busy}
                    placeholder="Email address"
                    onChange={(e) => setInput(e.target.value)}
                  />
                  <Button type="submit" disabled={busy}>
                    Add
                  </Button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
