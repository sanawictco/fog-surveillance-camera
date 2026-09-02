import {
  BaseResponseProps,
  ResponseBase,
} from 'src/dddLib/contracts/response.base';
interface CameraResponseProps extends BaseResponseProps {
  tenantId: string;
  name: string;
  productModel: string;
  hasPtz: boolean;
  hasAudio: boolean;
  nvrId: string;
  isActive: boolean;
}

export class CameraResponseDto extends ResponseBase {
  tenantId: string;
  name: string;
  productModel: string;
  hasPtz: boolean;
  hasAudio: boolean;
  nvrId: string;
  isActive: boolean;

  constructor(props: CameraResponseProps) {
    super(props);
    this.tenantId = props.tenantId;
    this.name = props.name;
    this.productModel = props.productModel;
    this.hasPtz = props.hasPtz;
    this.hasAudio = props.hasAudio;
    this.nvrId = props.nvrId;
    this.isActive = props.isActive;
  }
}
