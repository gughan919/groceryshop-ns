import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { configureServer } = require('../dist/server.cjs');

let appPromise = null;

export default async function handler(req, res) {
  if (!appPromise) {
    appPromise = configureServer();
  }

  const app = await appPromise;
  return app(req, res);
}
