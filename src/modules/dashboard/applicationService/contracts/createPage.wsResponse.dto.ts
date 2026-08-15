import { WebsocketMsgBaseDto } from 'src/extensions/websocket/websocket.service';
import { PageResponseDto } from './page.response.dto';
import { PageWebSocketTypes } from '../../shares/pageWebsocketTypes.enum';
import { PageConfigs } from '../../domain/page.type';

export interface CreatePageWsResponseDto extends WebsocketMsgBaseDto {
  type: PageWebSocketTypes.CONFIG;
  data: PageResponseDto;
  message: string | { msgKey: string; msgParams?: string[] };
  metadata: { configType: PageConfigs.CREATE_PAGE; msgId: string };
}
