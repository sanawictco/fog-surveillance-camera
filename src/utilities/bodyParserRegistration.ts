import { INestApplication } from '@nestjs/common';
import * as bodyParser from 'body-parser';

export function registerBodyParsers(app: INestApplication): void {
  app.use(bodyParser.json({ limit: '5000mb' }));
  app.use(bodyParser.urlencoded({ limit: '5000mb', extended: true }));
}
