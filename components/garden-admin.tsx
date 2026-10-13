'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ModerationQueue } from './moderation-queue';
import { ReportQueue } from './report-queue';
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
    ...(method !== 'GET' && body !== undefined
      ? {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
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
  const [password, setPassword] = useState(''),
    [repeat, setRepeat] = useState(''),
    [setupUrl, setSetupUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState(''),
    [newPassword, setNewPassword] = useState('');
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
      'setup',
    );
    if (token) {
      // Synchronize the one-time invitation from the browser URL, then erase it.
      // oxlint-disable-next-line react/react-compiler
      setLink(token);
      setInput(
        new URLSearchParams(window.location.hash.slice(1)).get('email') || '',
      );
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
    // A changed authenticated identity starts a fresh external data load.
    // oxlint-disable-next-line react/react-compiler
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
                setSetupUrl('');
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
      {notice && <output className="admin-notice">{notice}</output>}
      {loading && !email ? (
        <output>Loading…</output>
      ) : !email ? (
        <section className="admin-login">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void act(async () => {
                if (link) {
                  if (password !== repeat)
                    throw new Error('Passwords do not match.');
                  await call('setup', 'POST', {
                    email: input,
                    token: link,
                    password,
                  });
                  setLink('');
                  setPassword('');
                  setRepeat('');
                  setNotice('Password set. Sign in below.');
                } else {
                  const result = await call<{ email: string }>(
                    'login',
                    'POST',
                    { email: input, password },
                  );
                  setPassword('');
                  setEmail(result.email);
                  setInput('');
                }
              });
            }}
          >
            {link && <h2>Choose your password</h2>}
            <label htmlFor="admin-email">Admin email</label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="username"
              value={input}
              required
              disabled={busy || Boolean(link)}
              onChange={(e) => setInput(e.target.value)}
            />
            <label htmlFor="admin-password">Password</label>
            <Input
              id="admin-password"
              type="password"
              autoComplete={link ? 'new-password' : 'current-password'}
              value={password}
              minLength={link ? 8 : undefined}
              maxLength={128}
              required
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
            {link && (
              <>
                <p>Use at least 8 characters. A passphrase works well.</p>
                <label htmlFor="admin-repeat">Confirm password</label>
                <Input
                  id="admin-repeat"
                  type="password"
                  autoComplete="new-password"
                  value={repeat}
                  required
                  disabled={busy}
                  onChange={(e) => setRepeat(e.target.value)}
                />
              </>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? 'Please wait…' : link ? 'Set password' : 'Sign in'}
            </Button>
            {link && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setLink('');
                  setPassword('');
                  setRepeat('');
                }}
              >
                Back to sign in
              </Button>
            )}
            {!link && <p>Access is limited to approved admins.</p>}
          </form>
        </section>
      ) : (
        <>
          <p className="admin-identity">{email}</p>
          <ModerationQueue
            key={email}
            onReviewed={() => void loadIdeas().catch(fail)}
          />
          <ReportQueue
            key={'reports:' + email}
            onHandled={() => void loadIdeas().catch(fail)}
          />
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
            <output>Loading…</output>
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
                    <fieldset
                      className="admin-confirm"
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
                    </fieldset>
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
              {setupUrl && (
                <div className="admin-notice">
                  <p>
                    Share this private setup link with the admin. It expires in
                    24 hours.
                  </p>
                  <Input
                    aria-label="Private password setup link"
                    value={setupUrl}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    const result = await call<{ setupUrl?: string }>(
                      'members',
                      'POST',
                      { email: input },
                    );
                    setSetupUrl(result.setupUrl || '');
                    await loadAdmins();
                    setInput('');
                    setNotice('Admin access saved.');
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void act(async () => {
                    await call('password', 'POST', {
                      currentPassword,
                      password: newPassword,
                    });
                    setEmail(null);
                    setCurrentPassword('');
                    setNewPassword('');
                    setSetupUrl('');
                    setNotice('Password changed. Sign in again.');
                  });
                }}
                className="admin-login"
              >
                <h2>Change your password</h2>
                <label htmlFor="current-password">Current password</label>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  required
                  maxLength={128}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
                <label htmlFor="next-password">New password</label>
                <Input
                  id="next-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  required
                  minLength={8}
                  maxLength={128}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button type="submit" disabled={busy}>
                  Change password
                </Button>
              </form>
            </section>
          )}
        </>
      )}
    </main>
  );
}
