import { createHash } from 'node:crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { IdempotencyRecord } from '../entities/idempotency-record.entity';

@Injectable()
export class IdempotencyService {
  constructor(@InjectRepository(IdempotencyRecord) private readonly repo: Repository<IdempotencyRecord>) {}

  /**
   * Look up a non-expired record for `key + userId`. If found and `requestHash`
   * matches, returns the cached response. If found and hash mismatches, throws 409.
   * Otherwise returns null (caller proceeds with the actual request).
   */
  async get(
    key: string,
    userId: string,
    requestHash: string,
  ): Promise<{ status: number; body: Record<string, unknown> } | null> {
    const record = await this.repo.findOne({
      where: { key, userId, expiresAt: MoreThan(new Date()) },
    });
    if (!record) return null;
    if (record.requestHash !== requestHash) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Same Idempotency-Key used with a different request body',
      });
    }
    return { status: record.responseStatus, body: record.responseBody };
  }

  async put(
    key: string,
    userId: string,
    requestHash: string,
    responseStatus: number,
    responseBody: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.save({
      key,
      userId,
      requestHash,
      responseStatus,
      responseBody,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  static hashRequest(body: unknown): string {
    return createHash('sha256').update(canonicalize(body)).digest('hex');
  }
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(',')}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map(
    (k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`,
  );
  return `{${entries.join(',')}}`;
}
