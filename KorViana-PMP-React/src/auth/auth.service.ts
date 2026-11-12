import {
  ConflictException,
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { Profile, UserRole } from '../database/entities/profile.entity';
import { LoginDto, RegisterDto } from './auth.dto';

export type PublicProfile = Pick<Profile, 'id' | 'fullName' | 'email' | 'phone' | 'role' | 'isMaster'>;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Profile) private readonly profiles: Repository<Profile>,
    private readonly jwt: JwtService,
  ) {}

  async registerCustomer(input: RegisterDto): Promise<{ profile: PublicProfile; token: string }> {
    const email = input.email.trim().toLowerCase();
    if (Buffer.byteLength(input.password, 'utf8') > 72) {
      throw new BadRequestException('Password must be no more than 72 bytes.');
    }
    if (await this.profiles.existsBy({ email })) {
      throw new ConflictException('An account with this email already exists.');
    }

    const profile = this.profiles.create({
      fullName: input.fullName.trim(),
      email,
      passwordHash: await bcrypt.hash(input.password, 12),
      phone: input.phone?.trim() || null,
      role: 'customer',
      isMaster: false,
      associateId: null,
    });
    try {
      await this.profiles.save(profile);
    } catch (error) {
      if (error instanceof Error && 'driverError' in error
        && typeof error.driverError === 'object' && error.driverError !== null
        && 'code' in error.driverError && error.driverError.code === '23505') {
        throw new ConflictException('An account with this email already exists.');
      }
      throw error;
    }
    return { profile: this.toPublicProfile(profile), token: await this.sign(profile) };
  }

  async login(input: LoginDto, expectedRole?: string): Promise<{ profile: PublicProfile; token: string }> {
    const email = input.email.trim().toLowerCase();
    const profile = await this.profiles.findOneBy({ email });
    if (Buffer.byteLength(input.password, 'utf8') > 72
      || !profile || !(await bcrypt.compare(input.password, profile.passwordHash))) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }
    if (expectedRole && expectedRole !== profile.role
      && !(expectedRole === 'agent' && profile.role === 'associate')) {
      throw new UnauthorizedException(`This account does not have ${expectedRole} access.`);
    }
    return { profile: this.toPublicProfile(profile), token: await this.sign(profile) };
  }

  async verifyToken(token: string): Promise<Profile | null> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(token);
      return this.profiles.findOneBy({ id: payload.sub });
    } catch (error) {
      if (error instanceof Error && ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)) {
        return null;
      }
      throw error;
    }
  }

  publicProfile(profile: Profile): PublicProfile {
    return this.toPublicProfile(profile);
  }

  private sign(profile: Profile): Promise<string> {
    return this.jwt.signAsync({ sub: profile.id, role: profile.role });
  }

  private toPublicProfile(profile: Profile): PublicProfile {
    return {
      id: profile.id,
      fullName: profile.fullName,
      email: profile.email,
      phone: profile.phone,
      role: profile.role as UserRole,
      isMaster: profile.isMaster,
    };
  }
}
