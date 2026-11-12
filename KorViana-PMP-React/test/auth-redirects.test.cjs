const assert = require('node:assert/strict');
const test = require('node:test');
const { ConflictException } = require('@nestjs/common');
const { AuthController } = require('../dist/auth/auth.controller');

const createResponse = () => {
  const redirects = [];
  return {
    redirects,
    cookie() {},
    redirect(...args) {
      redirects.push(args);
    },
  };
};

test('successful registration redirects to the dashboard with a GET', async () => {
  const auth = {
    async registerCustomer() {
      return { token: 'session-token' };
    },
  };
  const controller = new AuthController(auth, { get: () => 'production' });
  const response = createResponse();

  await controller.register({ email: 'new@example.com', password: 'a-secure-password' }, response);

  assert.deepEqual(response.redirects, [[303, '/dashboard']]);
});

test('duplicate registration redirects back to the registration form with a GET', async () => {
  const auth = {
    async registerCustomer() {
      throw new ConflictException('An account with this email already exists.');
    },
  };
  const controller = new AuthController(auth, { get: () => 'production' });
  const response = createResponse();

  await controller.register({ email: 'existing@example.com', password: 'a-secure-password' }, response);

  assert.deepEqual(response.redirects, [[
    303,
    '/login?mode=register&error=An%20account%20with%20this%20email%20already%20exists.',
  ]]);
});
