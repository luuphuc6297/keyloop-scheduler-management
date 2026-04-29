import { AnonymizeCustomerSchema, SearchCustomersSchema } from './customer.schema';

describe('SearchCustomersSchema', () => {
  it('accepts empty body and applies default limit', () => {
    const res = SearchCustomersSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.limit).toBe(20);
  });

  it('rejects too-long query string', () => {
    const res = SearchCustomersSchema.safeParse({ q: 'a'.repeat(200) });
    expect(res.success).toBe(false);
  });
});

describe('AnonymizeCustomerSchema', () => {
  it('requires reason', () => {
    const res = AnonymizeCustomerSchema.safeParse({});
    expect(res.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const res = AnonymizeCustomerSchema.safeParse({ reason: '' });
    expect(res.success).toBe(false);
  });

  it('accepts a real reason', () => {
    const res = AnonymizeCustomerSchema.safeParse({ reason: 'GDPR Article 17 request' });
    expect(res.success).toBe(true);
  });
});
