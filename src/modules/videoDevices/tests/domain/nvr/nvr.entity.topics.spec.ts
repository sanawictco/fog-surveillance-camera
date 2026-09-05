import { NvrEntity } from '../../../domain/nvr/nvr.entity';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-1', nvrId: 'nvr-1' }),
}));

describe('NvrEntity MQTT topics', () => {
  it('matches cloud-surveillance-camera/src/modules/videoDevices/shared/deviceMqttTopics.ts', () => {
    expect(NvrEntity.getFogPubToCloudMqttTopics().videoDeviceSoftwareConfigs).toBe(
      'tenants/tenant-1/nvrs/nvr-1/config/to-cloud',
    );
    expect(NvrEntity.getFogSubOnCloudMqttTopics()).toEqual({
      videoDeviceSoftwareConfigs: 'tenants/tenant-1/nvrs/nvr-1/config/to-fog',
      cloudRecoveryDataAck: 'tenants/tenant-1/nvrs/nvr-1/cloud-recovery/to-fog',
      cloudIsAvailable: 'tenants/tenant-1/nvrs/nvr-1/cloud-status/to-fog',
    });
  });
});
