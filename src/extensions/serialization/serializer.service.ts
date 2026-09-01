import { Injectable } from '@nestjs/common';
import { SerializerBase } from './serializer.base';
@Injectable()
export class SerializerService implements SerializerBase {
  serialize(value: unknown): string {
    return JSON.stringify(value);
  }

  deserialize(value: string) {
    return JSON.parse(value);
  }
}
