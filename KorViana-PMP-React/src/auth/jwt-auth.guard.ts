import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { Profile } from '../database/entities/profile.entity';

export interface AuthenticatedRequest extends Request {
  user: Profile;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = request.cookies?.korviana_token
      ?? request.get('authorization')?.replace(/^Bearer\s+/i, '');

    if (!token) throw new UnauthorizedException('Sign in to continue.');
    const profile = await this.authService.verifyToken(token);
    if (!profile) throw new UnauthorizedException('Your session has expired. Sign in again.');

    request.user = profile;
    return true;
  }
}
