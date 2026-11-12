import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const cookieToken = request.cookies?.korviana_csrf;
    const submittedToken = request.get('x-csrf-token')
      ?? (typeof request.body?._csrf === 'string' ? request.body._csrf : undefined);
    const origin = request.get('origin');

    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        throw new ForbiddenException('Cross-origin request rejected.');
      }
      if (originHost !== request.get('host')) {
        throw new ForbiddenException('Cross-origin request rejected.');
      }
    }
    if (!cookieToken || !submittedToken) {
      throw new ForbiddenException('Refresh the page and try again.');
    }

    const expected = Buffer.from(cookieToken);
    const received = Buffer.from(submittedToken);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
      throw new ForbiddenException('Refresh the page and try again.');
    }

    return true;
  }
}
