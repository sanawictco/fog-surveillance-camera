import { IsNotEmpty, IsString } from 'class-validator';
import { validateMqttPayload } from './validateMqttPayload';

class TestPayload {
  @IsString()
  @IsNotEmpty()
  msgId!: string;
}

describe('validateMqttPayload', () => {
  it('returns a validated class instance', () => {
    const payload = validateMqttPayload(TestPayload, { msgId: 'msg-1' });

    expect(payload).toBeInstanceOf(TestPayload);
    expect(payload).toEqual({ msgId: 'msg-1' });
  });

  it('rejects unknown fields before side effects', () => {
    expect(() =>
      validateMqttPayload(TestPayload, {
        msgId: 'msg-1',
        unexpected: true,
      }),
    ).toThrow('property unexpected should not exist');
  });

  it('rejects invalid payloads', () => {
    expect(() => validateMqttPayload(TestPayload, { msgId: '' })).toThrow(
      'Invalid MQTT payload for TestPayload',
    );
  });
});
