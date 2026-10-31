import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import path from 'node:path';
const require = createRequire(import.meta.url), root = path.resolve('.data/editorial-qa');
await mkdir(path.join(root, 'users'), { recursive: true });
const accounts = {};
for (const [i, role] of ['owner','writer','other','editor','staff','client'].entries()) {
  const phone = `+1202555019${i}`, password = randomBytes(20).toString('base64url'), salt = randomBytes(16).toString('hex');
  const id = `u-${createHash('sha256').update(phone).digest('hex').slice(0,32)}`;
  accounts[role] = { phone, password, id };
  await writeFile(path.join(root,'users',`${id}.json`),JSON.stringify({ id, phone, name:`Editorial QA ${role}`, role:role === 'owner' ? 'staff' : role === 'other' ? 'writer' : role, owner:role === 'owner', email:'', verifiedAt:new Date().toISOString(), createdAt:new Date().toISOString(), authVersion:1, passwordHash:`${salt}:${scryptSync(password,salt,64).toString('hex')}` }),{mode:0o600});
}
await writeFile(path.join(root,'accounts.json'),JSON.stringify(accounts),{mode:0o600});
const child = spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3104'],{windowsHide:true,stdio:'inherit',env:{...process.env, ACIES_MEDIA_STORAGE:'database', DATABASE_URL:'', ACIES_SUPABASE_URL:'', ACIES_SUPABASE_SERVICE_ROLE_KEY:'', ACIES_STORAGE_DIRECTORY:root, ACIES_PORTAL_URL:'http://127.0.0.1:3104', ACIES_TEST_MODE:'true', ACIES_ALLOW_LOCAL_VERIFICATION:'true', ACIES_OTP_MODE:'local', MNOTIFY_API_KEY:'', TWILIO_ACCOUNT_SID:'', TWILIO_AUTH_TOKEN:'', ACIES_BRIDGE_SECRET:'editorial-qa-bridge-secret-for-local-tests-only'}});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>{process.exitCode=code||0;});
