import { CameraEntity } from '../../../domain/camera/camera.entity';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ tenantId: 'tenant-1', nvrId: 'nvr-1' }),
}));

describe('CameraEntity MQTT topics', () => {
  it('subscribes on the per-NVR cameras/to-fog topic (matches cloud-surveillance-camera cameraDataPubTopic)', () => {
    expect(CameraEntity.getFogSubOnCloudMqttTopics()).toEqual({
      cameraData: 'tenants/tenant-1/nvrs/nvr-1/cameras/to-fog',
    });
  });
});
