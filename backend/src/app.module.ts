import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import * as admin from 'firebase-admin';

import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import firebaseConfig from './config/firebase.config';
import redisConfig from './config/redis.config';
import encryptionConfig from './config/encryption.config';
import storageConfig from './config/storage.config';
import streamConfig from './config/stream.config';

import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CitiesModule } from './modules/cities/cities.module';
import { InterestsModule } from './modules/interests/interests.module';
import { StorageModule } from './modules/storage/storage.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { ParticipantsModule } from './modules/participants/participants.module';
import { AdminModule } from './modules/admin/admin.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

import { FirebaseAuthGuard } from './common/guards/firebase-auth.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, firebaseConfig, redisConfig, encryptionConfig, storageConfig, streamConfig],
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    PrismaModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    CitiesModule,
    InterestsModule,
    StorageModule,
    ActivitiesModule,
    ParticipantsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    if (!admin.apps.length) {
      const projectId = this.config.get<string>('firebase.projectId');
      const clientEmail = this.config.get<string>('firebase.clientEmail');
      const privateKey = this.config.get<string>('firebase.privateKey');

      if (!projectId || !clientEmail || !privateKey) {
        this.logger.warn(
          'Firebase credentials not configured — FirebaseAuthGuard will reject all protected requests',
        );
        return;
      }

      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
      });
      this.logger.log(`Firebase Admin initialized for project: ${projectId}`);
    }
  }
}
