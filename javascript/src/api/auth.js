/**
 * HyperBabel API — auth-level read endpoints exposed in the public Swagger.
 *
 * Webhook CRUD is intentionally not surfaced — it is a tenant-admin
 * operation that lives in the HyperBabel Console.
 */

import { api } from './client.js';

export const getUsage = () => api.get('/auth/usage');
