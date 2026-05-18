import { describe, expect, it } from 'vitest';
import { GET as overviewGet } from '../src/app/api/overview/route';
import { GET as configGet } from '../src/app/api/config/route';

describe('API routes', () => {
  it('overview route returns JSON', async () => {
    const response = await overviewGet();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('totalSessions');
  });

  it('config route returns paths', async () => {
    const response = await configGet();
    const body = await response.json();
    expect(body).toHaveProperty('reportsDirectory');
  });
});
