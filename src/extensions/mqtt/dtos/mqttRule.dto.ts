export class MqttRuleDto {
  action: 'publish' | 'subscribe';
  permission: 'allow' | 'deny';
  topic: string;
}
