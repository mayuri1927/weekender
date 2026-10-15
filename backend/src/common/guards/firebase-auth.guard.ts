import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes explicitly marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed authorization header');
    }

    const idToken = authHeader.substring(7);

    try {
      const decoded = await admin.auth().verifyIdToken(idToken, true);
      request.user = {
        uid: decoded.uid,
        phone_number: decoded.phone_number,
        email: decoded.email,
      };
      return true;
    } catch (err) {
      this.logger.warn(`Firebase token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired Firebase token');
    }
  }
}
