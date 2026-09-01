import { Global, Module } from '@nestjs/common';
import { ServiceProvider } from './serviceProvider.service';
import { CqrsModule } from '@nestjs/cqrs';
import { TranslatorModule } from '../translation/translator.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { SerializerModule } from '../serialization/serializer.module';
import { HttpModule } from '../http/http.module';
@Global()
@Module({
  imports: [
    CqrsModule,
    TranslatorModule,
    SerializerModule,
    SchedulerModule,
    HttpModule,
  ],
  providers: [ServiceProvider],
  exports: [ServiceProvider],
})
export class ServiceProviderModule {}
