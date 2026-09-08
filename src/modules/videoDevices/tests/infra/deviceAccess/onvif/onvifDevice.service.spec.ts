import { OnvifDeviceService } from '../../../../infra/deviceAccess/onvif/onvifDevice.service';

const ENDPOINT = { xaddr: 'http://192.168.10.51/onvif/device_service', deviceTimeOffsetMs: 0 };
const CREDS = { username: 'admin', password: 'secret' };

describe('OnvifDeviceService', () => {
  it('maps GetDeviceInformation into a device information record', async () => {
    const call = jest.fn().mockResolvedValue({
      GetDeviceInformationResponse: {
        Manufacturer: 'ACME',
        Model: 'IPC-1234',
        FirmwareVersion: 'V5.7.3',
        SerialNumber: 'SN12345678',
        HardwareId: 'HW-9',
      },
    });
    expect(
      await new OnvifDeviceService({ call } as never).getDeviceInformation(ENDPOINT, CREDS),
    ).toEqual({
      manufacturer: 'ACME',
      model: 'IPC-1234',
      firmwareVersion: 'V5.7.3',
      serialNumber: 'SN12345678',
      hardwareId: 'HW-9',
    });
  });

  it('normalizes a single service into an array', async () => {
    const call = jest.fn().mockResolvedValue({
      GetServicesResponse: {
        Service: {
          Namespace: 'http://www.onvif.org/ver20/media/wsdl',
          XAddr: 'http://192.168.10.51/onvif/media2',
        },
      },
    });
    const services = await new OnvifDeviceService({ call } as never).getServices(ENDPOINT, CREDS);
    expect(services).toEqual([
      {
        namespace: 'http://www.onvif.org/ver20/media/wsdl',
        xaddr: 'http://192.168.10.51/onvif/media2',
      },
    ]);
  });

  it('returns the first non-empty hardware address, normalized', async () => {
    const call = jest.fn().mockResolvedValue({
      GetNetworkInterfacesResponse: {
        NetworkInterfaces: [
          { Info: { HwAddress: '' } },
          { Info: { HwAddress: 'aa-bb-cc-dd-ee-ff' } },
        ],
      },
    });
    expect(
      await new OnvifDeviceService({ call } as never).getMacAddress(ENDPOINT, CREDS),
    ).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('returns undefined when no interface reports a usable address', async () => {
    const call = jest.fn().mockResolvedValue({
      GetNetworkInterfacesResponse: { NetworkInterfaces: { Info: { HwAddress: 'nonsense' } } },
    });
    expect(
      await new OnvifDeviceService({ call } as never).getMacAddress(ENDPOINT, CREDS),
    ).toBeUndefined();
  });
});
