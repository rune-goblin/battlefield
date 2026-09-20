import { test, expect } from 'vitest';
import { gate } from './access.mjs';

const env = { ACCESS_PASSWORD: 'a-shared-password', ACCESS_SECRET: 'secret-'.repeat(8) };
const get = (path = '/', options = {}) => new Request(`https://battlefield.example${path}`, options);
const login = (body) => new Request('https://battlefield.example/__access', { method: 'POST', body: new URLSearchParams(body).toString() });
const cookieFrom = (response) => response.headers.get('set-cookie').split(';')[0];

const signedIn = async (next = '/') => cookieFrom(await gate(login({ password: env.ACCESS_PASSWORD, next }), env));

test('fails closed when the password or secret is missing or weak', async () => {
  for (const broken of [{}, { ...env, ACCESS_SECRET: 'short' }, { ...env, ACCESS_PASSWORD: 'tiny' }]) {
    expect((await gate(get(), broken)).status).toBe(503);
  }
});

test('blocks every page until the password is entered', async () => {
  for (const path of ['/', '/rules.html', '/magic-progression-proposal.html', '/dev/two-clients/', '/index.html']) {
    const response = await gate(get(path), env);
    expect(response.status).toBe(401);
    expect(await response.text()).toMatch(/name="password"/);
  }
  expect((await gate(get('/', { method: 'POST' }), env)).status).toBe(401);
});

test('a correct password sets a signed cookie that opens every route', async () => {
  const response = await gate(login({ password: env.ACCESS_PASSWORD, next: '/rules.html' }), env);
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/rules.html');
  expect(response.headers.get('set-cookie')).toMatch(/HttpOnly.*Secure.*SameSite=Lax/);
  const headers = { cookie: cookieFrom(response) };
  expect(await gate(get('/', { headers }), env)).toBe(null);
  expect(await gate(get('/rules.html', { headers }), env)).toBe(null);
});

test('rejects a wrong password, a forged cookie, another secret, and an expired session', async () => {
  expect((await gate(login({ password: 'wrong', next: '/' }), env)).status).toBe(401);
  const cookie = await signedIn();
  const token = cookie.split('=')[1];
  expect((await gate(get('/', { headers: { cookie: 'battlefield_access=v1.99999999999.forged' } }), env)).status).toBe(401);
  expect((await gate(get('/', { headers: { cookie } }), { ...env, ACCESS_SECRET: 'other-'.repeat(8) })).status).toBe(401);
  const expired = `battlefield_access=v1.${Number(token.split('.')[1]) + 1}.${token.split('.')[2]}`;
  expect((await gate(get('/', { headers: { cookie: expired } }), env)).status).toBe(401);
  expect((await gate(get('/', { headers: { cookie } }), env, Date.now() + 1000 * 60 * 60 * 24 * 15)).status).toBe(401);
});

test('changing the password ends the sessions it opened', async () => {
  const cookie = await signedIn();
  expect(await gate(get('/', { headers: { cookie } }), env)).toBe(null);
  const rotated = { ...env, ACCESS_PASSWORD: 'a-different-password' };
  expect((await gate(get('/', { headers: { cookie } }), rotated)).status).toBe(401);
  const fresh = cookieFrom(await gate(login({ password: rotated.ACCESS_PASSWORD, next: '/' }), rotated));
  expect(await gate(get('/', { headers: { cookie: fresh } }), rotated)).toBe(null);
  expect((await gate(login({ password: env.ACCESS_PASSWORD, next: '/' }), rotated)).status).toBe(401);
});

test('sends the visitor back to a same-site path only', async () => {
  for (const next of ['//evil.example/', 'https://evil.example/', '\\evil.example', '/__access', '']) {
    expect((await gate(login({ password: env.ACCESS_PASSWORD, next }), env)).headers.get('location')).toBe('/');
  }
  const deep = await gate(login({ password: env.ACCESS_PASSWORD, next: '/rules.html?x=1#magic' }), env);
  expect(deep.headers.get('location')).toBe('/rules.html?x=1#magic');
});
