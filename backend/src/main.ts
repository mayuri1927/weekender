import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port') || 3000;
  const corsOrigin = config.get<string>('app.corsOrigin') || 'http://localhost:3001';
  const nodeEnv = config.get<string>('app.nodeEnv') || 'development';

  // Security headers
  app.use(helmet());

  // CORS — only allow configured origin
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  });

  // Global validation — strip unknown fields, enforce class-validator rules
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // API versioning
  app.setGlobalPrefix('api/v1');

  // Swagger — only in non-production
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Weekender API')
      .setDescription('Weekender — Activity-first social platform · Phase 1')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(port);
  console.log(`Weekender API running on http://localhost:${port}/api/v1`);
  if (nodeEnv !== 'production') {
    console.log(`Swagger docs at http://localhost:${port}/api/docs`);
  }
}
bootstrap();
