export interface SerializerBase {
  deserialize(value: string): unknown;
  serialize(value: unknown): string;
}
