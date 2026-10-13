import { readBody, InputError } from '@/lib/server';
import {
  adminFailure,
  normalizeEmail,
  allowed,
  loginLimit,
  loginFailed,
  issueAdminSession,
} from '@/server/admin-auth';
import { storedPassword, verifyPassword } from '@/server/admin-password';
export async function POST(request: Request) {
  try {
    const body = await readBody(request),
      email = normalizeEmail(body?.email);
    if (typeof body?.password !== 'string' || body.password.length > 128)
      throw new InputError('Email or password is incorrect.', 401);
    await loginLimit(request, email);
    const eligible = await allowed(email);
    const hash = eligible ? await storedPassword(email) : null;
    if (!(await verifyPassword(body.password, hash)) || !eligible) {
      await loginFailed(email);
      throw new InputError('Email or password is incorrect.', 401);
    }
    return issueAdminSession(request, email);
  } catch (error) {
    return adminFailure(error);
  }
}
