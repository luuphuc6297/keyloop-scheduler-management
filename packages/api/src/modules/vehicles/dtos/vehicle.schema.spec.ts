import { SearchVehiclesSchema } from './vehicle.schema';

describe('SearchVehiclesSchema', () => {
  it('requires either vin or customer_id', () => {
    const res = SearchVehiclesSchema.safeParse({});
    expect(res.success).toBe(false);
  });

  it('accepts vin alone', () => {
    const res = SearchVehiclesSchema.safeParse({ vin: 'ABC123' });
    expect(res.success).toBe(true);
  });

  it('accepts customer_id alone', () => {
    const res = SearchVehiclesSchema.safeParse({ customer_id: '11111111-1111-1111-1111-111111111111' });
    expect(res.success).toBe(true);
  });

  it('coerces and clamps limit', () => {
    const res = SearchVehiclesSchema.safeParse({ vin: 'X', limit: '50' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.limit).toBe(50);

    const tooBig = SearchVehiclesSchema.safeParse({ vin: 'X', limit: 5000 });
    expect(tooBig.success).toBe(false);
  });
});
