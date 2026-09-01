import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import AppConfig from 'configs/app.config';
import { MongoService } from './mongo.service';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: AppConfig().mongodb.url,
        bufferCommands: false,
        maxPoolSize: 20,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5_000,
        socketTimeoutMS: 45_000,
        connectTimeoutMS: 10_000,
        heartbeatFrequencyMS: 10_000,
      }),
    }),
  ],
  providers: [MongoService],
  exports: [MongoService],
})
export class MongoModule {}
