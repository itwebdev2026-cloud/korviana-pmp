import 'reflect-metadata';
import { Request, Response } from 'express';
import { createApp } from './app-factory';

let appPromise: ReturnType<typeof createExpressApp> | undefined;

async function createExpressApp() {
  const app = await createApp();
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(request: Request, response: Response): Promise<void> {
  appPromise ??= createExpressApp();
  const expressApp = await appPromise;
  expressApp(request, response);
}
