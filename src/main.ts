import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import AppConfig from 'configs/app.config';
import * as bodyParser from 'body-parser';
import { setupSwaggerRegisteration } from './utilities/swaggerRegisteration';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (AppConfig().environment !== 'production') {
    setupSwaggerRegisteration(app);
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );
  app.use(bodyParser.json({ limit: '5000mb' }));
  app.use(bodyParser.urlencoded({ limit: '5000mb', extended: true }));
  app.use(helmet());
  app.enableCors({ origin: true, credentials: true });
  app.use(cookieParser());
  app.enableShutdownHooks();
  await app.listen(AppConfig().port);
}
bootstrap();
