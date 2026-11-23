import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const [contact, path = '.env.push.local'] = process.argv.slice(2);
if (!contact || !/^(mailto:|https:\/\/)/.test(contact) || /[\r\n]/.test(contact)) {
  throw new Error('Usage: node scripts/generate-push-config.mjs mailto:you@example.com [.env.push.local]');
}
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
const contents = `WebPush__Enabled=true\nWebPush__RunWorker=true\nWebPush__Subject=${contact}\nWebPush__PublicKey=${publicKey}\nWebPush__PrivateKey=${jwk.d}\nWebPush__DispatchKey=${randomBytes(32).toString('hex')}\n`;
// Never overwrite an existing key: rotating it invalidates existing browser subscriptions.
writeFileSync(path, contents, { flag: 'wx', mode: 0o600 });
console.log(`Wrote private configuration to ${path}. Keep it out of source control. Values were not printed.`);
