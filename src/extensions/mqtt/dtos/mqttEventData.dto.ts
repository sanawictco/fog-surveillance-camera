export interface MqttEventDataDto {
  topic: string;
  message: string;
}

export interface MqttEventByteDataDto {
  topic: string;
  message: Buffer;
}
