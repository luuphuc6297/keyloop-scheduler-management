import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ulid } from 'ulid';
import { requestContext } from '../async-context/request-context';

const HEADER = 'x-request-id';
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(HEADER);
    const id = incoming && ULID_RE.test(incoming) ? incoming : ulid();
    (req as Request & { id: string }).id = id;
    res.setHeader('X-Request-Id', id);
    requestContext.run({ requestId: id }, () => next());
  }
}
