import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { RequestContextService } from 'src/dddLib/utils/appRequestContext';
import { generateRandomId } from 'src/dddLib/utils/randomIdGenerator';

@Injectable()
export class ContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    /**
     * Setting an ID in the global context for each request.
     * This ID can be used as correlation id shown in logs
     */
    const requestId = request?.body?.requestId ?? generateRandomId(6);

    RequestContextService.setRequestId(requestId);

    return next.handle().pipe(
      tap(() => {
        console.log('context intercepotr called...');
        // Perform cleaning if needed
      }),
    );
  }
}
