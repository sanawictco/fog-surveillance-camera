import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import {
  OnvifFaultError,
  OnvifSoapClient,
} from '../../../../infra/deviceAccess/onvif/onvifSoap.client';

jest.mock('configs/app.config', () => ({
  __esModule: true,
  default: () => ({ onvif: { requestTimeoutMs: 2000 } }),
}));

function soapResponse(innerXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">' +
    `<SOAP-ENV:Body>${innerXml}</SOAP-ENV:Body></SOAP-ENV:Envelope>`
  );
}

let server: Server;
let baseUrl = '';
let lastBody = '';
let handler: () => { status: number; body: string };

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      lastBody = Buffer.concat(chunks).toString('utf8');
      const { status, body } = handler();
      res.writeHead(status, { 'content-type': 'application/soap+xml' });
      res.end(body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/onvif/device_service`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('OnvifSoapClient', () => {
  it('returns the parsed body with namespace prefixes stripped', async () => {
    handler = () => ({
      status: 200,
      body: soapResponse(
        '<tds:GetDeviceInformationResponse xmlns:tds="http://www.onvif.org/ver10/device/wsdl">' +
          '<tds:Manufacturer>ACME</tds:Manufacturer>' +
          '</tds:GetDeviceInformationResponse>',
      ),
    });
    const body = await new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>');
    expect(body.GetDeviceInformationResponse.Manufacturer).toBe('ACME');
  });

  it('omits the Security header when no credentials are given', async () => {
    handler = () => ({ status: 200, body: soapResponse('<Ok/>') });
    await new OnvifSoapClient().call(baseUrl, '<GetSystemDateAndTime/>');
    expect(lastBody).not.toContain('Security');
  });

  it('includes a Security header when credentials are given', async () => {
    handler = () => ({ status: 200, body: soapResponse('<Ok/>') });
    await new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>', {
      credentials: { username: 'admin', password: 'secret' },
    });
    expect(lastBody).toContain('<Username>admin</Username>');
    expect(lastBody).toContain('PasswordDigest');
  });

  it('raises OnvifFaultError carrying the fault reason', async () => {
    handler = () => ({
      status: 400,
      body: soapResponse(
        '<SOAP-ENV:Fault xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">' +
          '<SOAP-ENV:Reason><SOAP-ENV:Text>Sender not authorized</SOAP-ENV:Text></SOAP-ENV:Reason>' +
          '</SOAP-ENV:Fault>',
      ),
    });
    await expect(
      new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>'),
    ).rejects.toThrow(OnvifFaultError);
    await expect(
      new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>'),
    ).rejects.toThrow('Sender not authorized');
  });

  it('rejects a non-SOAP response body', async () => {
    handler = () => ({ status: 200, body: '<html>login page</html>' });
    await expect(
      new OnvifSoapClient().call(baseUrl, '<GetDeviceInformation/>'),
    ).rejects.toThrow('not a SOAP envelope');
  });
});
