import { RequestContext } from 'nestjs-request-context';
import type { UserInfoDto } from 'src/extensions/userInfo/userInfo.dto';
// Setting some isolated context for each request.

export class AppRequestContext extends RequestContext {
  requestId!: string;
  user?: UserInfoDto;
}

export class RequestContextService {
  static getContext(): AppRequestContext {
    const ctx: AppRequestContext = RequestContext.currentContext?.req;
    return ctx;
  }

  static setRequestId(id: string): void {
    const ctx = this.getContext();
    ctx.requestId = id;
  }

  static getRequestId(): string {
    return this.getContext()?.requestId;
  }
}
