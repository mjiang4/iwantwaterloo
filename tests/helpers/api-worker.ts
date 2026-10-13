import * as activity from '../../app/api/activity/route';
import * as reviews from '../../app/api/admin/reviews/route';
import * as manageReview from '../../app/api/manage/review/route';
import * as manageSetup from '../../app/api/manage/setup/route';
import * as managePassword from '../../app/api/manage/password/route';
import * as manageLogin from '../../app/api/manage/login/route';
import * as manageSession from '../../app/api/manage/session/route';
import * as manageIdeas from '../../app/api/manage/ideas/route';
import * as manageMembers from '../../app/api/manage/members/route';
import * as feedback from '../../app/api/feedback/route';
import * as ideas from '../../app/api/ideas/route';
import * as comments from '../../app/api/comments/route';
import * as support from '../../app/api/support/route';
import * as reports from '../../app/api/reports/route';
import * as loves from '../../app/api/loves/route';
import * as loveEcho from '../../app/api/loves/echo/route';
import * as visitor from '../../app/api/visitor/route';
import * as admin from '../../app/api/admin/route';
import * as session from '../../app/api/admin/session/route';
import * as scenario from '../../app/api/admin/scenario/route';

type Handler = (request: Request) => Response | Promise<Response>;
const routes: Record<string, Partial<Record<string, Handler>>> = {
  '/api/manage/review': manageReview,
  '/api/manage/setup': manageSetup,
  '/api/manage/password': managePassword,
  '/api/manage/login': manageLogin,
  '/api/manage/session': manageSession,
  '/api/manage/ideas': manageIdeas,
  '/api/manage/members': manageMembers,
  '/api/ideas': ideas,
  '/api/activity': activity,
  '/api/admin/reviews': reviews,
  '/api/feedback': feedback,
  '/api/comments': comments,
  '/api/support': support,
  '/api/reports': reports,
  '/api/loves': loves,
  '/api/loves/echo': loveEcho,
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
