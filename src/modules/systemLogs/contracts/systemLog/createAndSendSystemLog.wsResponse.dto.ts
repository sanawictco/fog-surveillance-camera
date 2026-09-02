import { WebsocketMsgBaseDto } from 'src/extensions/websocket/websocket.service';
import { SystemLogWebSocketTypes } from '../../shares/systemLogWebSocketTypes.enum';
import { CreateSystemLogProps } from '../../domain/systemLog.type';

export interface CreateAndSendSystemLogWsResponseDto extends WebsocketMsgBaseDto {
  type: SystemLogWebSocketTypes;
  data: CreateSystemLogProps;
  metadata: {
    configType?: string;
    dataType?: string;
    widget?: { id: string };
    cmdKey?: string;
  };
}
