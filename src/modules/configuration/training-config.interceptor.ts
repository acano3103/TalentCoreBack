import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, Subscription } from 'rxjs';
import { runTrainingConfigCache } from './training-config';

@Injectable()
export class TrainingConfigCacheInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return new Observable((subscriber) => {
      let subscription: Subscription | undefined;
      runTrainingConfigCache(() => {
        subscription = next.handle().subscribe(subscriber);
      });
      return () => subscription?.unsubscribe();
    });
  }
}
