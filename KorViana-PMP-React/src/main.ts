import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(cookieParser());
  app.use((req: { cookies?: Record<string, string> }, res: {
    cookie: (name: string, value: string, options: object) => void;
  }, next: () => void) => {
    if (!req.cookies?.korviana_csrf) {
      res.cookie('korviana_csrf', randomBytes(32).toString('hex'), {
        httpOnly: false,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      });
    }
    next();
  });
  app.useStaticAssets(join(__dirname, '..', 'public'));
  app.setBaseViewsDir(join(__dirname, 'views'));
  app.setViewEngine('ejs');
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }));
  app.enableShutdownHooks();

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

void bootstrap();
