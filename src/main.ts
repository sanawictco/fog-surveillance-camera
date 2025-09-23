import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import AppConfig from 'configs/app.config';
import { setupSwaggerRegisteration } from './utilities/swaggerRegisteration';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (AppConfig().environment !== 'production') {
    setupSwaggerRegisteration(app);
  }
  await app.listen(AppConfig().port);
}
bootstrap();
