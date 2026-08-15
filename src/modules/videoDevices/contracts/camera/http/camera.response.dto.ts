import { ResponseBase } from 'src/dddLib/contracts/response.base';
import { StreamsProps } from '../../../domain/camera/valueObjects/streams.vo';

export class CameraResponseDto extends ResponseBase {
  name!: string;
  productModel!: string;
  macAddress!: string;
  port!: number;
  streams!: StreamsProps;
  hasPtz!: boolean;
  hasAudio!: boolean;
  nvrId!: string;
}
