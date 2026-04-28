import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Observable } from 'rxjs';
import { DataSource } from 'typeorm';
import type { AuthContext } from '../../modules/auth/types/auth-context';

/**
 * Wraps each authenticated request in a Postgres transaction with
 * `SET LOCAL app.current_dealership = <user.dealershipId>` so that all
 * subsequent queries via the session are auto-filtered by RLS policies.
 *
 * Reference: design doc Section 7.6.
 */
@Injectable()
export class RlsContextInterceptor implements NestInterceptor {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: AuthContext; id?: string }>();
    const user = req.user;
    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      void this.ds
        .transaction(async (manager) => {
          await manager.query(`SELECT set_config('app.current_dealership', $1, true)`, [user.dealershipId]);
          await manager.query(`SELECT set_config('app.current_user_id', $1, true)`, [user.id]);
          if (req.id) {
            await manager.query(`SELECT set_config('app.current_request_id', $1, true)`, [req.id]);
          }
          return new Promise((resolve, reject) => {
            next.handle().subscribe({
              next: (value) => resolve(value),
              error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
            });
          });
        })
        .then((value) => {
          subscriber.next(value);
          subscriber.complete();
        })
        .catch((err: unknown) => {
          subscriber.error(err);
        });
    });
  }
}
