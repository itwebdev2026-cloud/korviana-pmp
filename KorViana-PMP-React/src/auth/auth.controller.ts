import {
  Body,
  Controller,
  ConflictException,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './auth.dto';
import { CsrfGuard } from '../security/csrf.guard';

@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Query('role') role: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const { token } = await this.auth.login(input, role);
      this.setSessionCookie(response, token);
      response.redirect('/dashboard');
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        response.redirect(`/login?role=${encodeURIComponent(role ?? 'customer')}&error=${encodeURIComponent(error.message)}`);
        return;
      }
      throw error;
    }
  }

  @Post('register')
  async register(@Body() input: RegisterDto, @Res() response: Response): Promise<void> {
    try {
      const { token } = await this.auth.registerCustomer(input);
      this.setSessionCookie(response, token);
      response.redirect('/dashboard');
    } catch (error) {
      if (error instanceof ConflictException) {
        response.redirect(`/login?mode=register&error=${encodeURIComponent(error.message)}`);
        return;
      }
      throw error;
    }
  }

  @Post('logout')
  logout(@Res() response: Response): void {
    response.clearCookie('korviana_token', { path: '/' });
    response.redirect('/');
  }

  private setSessionCookie(response: Response, token: string): void {
    response.cookie('korviana_token', token, {
      httpOnly: true,
      secure: this.config.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
  }
}
