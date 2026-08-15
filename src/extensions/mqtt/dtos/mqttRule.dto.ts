export interface MqttRuleDto {
  action: 'publish' | 'subscribe';
  permission: 'allow' | 'deny';
  topic: string;
}
