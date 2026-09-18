import * as ideas from '../../app/api/ideas/route';
import * as comments from '../../app/api/comments/route';
import * as support from '../../app/api/support/route';
import * as reports from '../../app/api/reports/route';
import * as tags from '../../app/api/tags/route';
import * as visitor from '../../app/api/visitor/route';
import * as admin from '../../app/api/admin/route';
import * as session from '../../app/api/admin/session/route';
import * as scenario from '../../app/api/admin/scenario/route';

type Handler = (request: Request) => Response | Promise<Response>;
const routes: Record<string, Partial<Record<string, Handler>>> = {
  '/api/ideas': ideas,
  '/api/comments': comments,
  '/api/support': support,
  '/api/reports': reports,
  '/api/tags': tags,
  '/api/visitor': visitor,
  '/api/admin': admin,
  '/api/admin/session': session,
  '/api/admin/scenario': scenario,
};
const worker = {
  fetch(request: Request) {
    const handler = routes[new URL(request.url).pathname]?.[request.method];
    return handler
      ? handler(request)
      : new Response('Not found', { status: 404 });
  },
};

export default worker;
