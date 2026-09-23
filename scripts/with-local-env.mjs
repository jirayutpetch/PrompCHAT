import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const secretPath = process.env.PROMPTCHAT_SECRETS_FILE || join(homedir(), 'Documents', 'supabase project promptchat password.txt');
const secretValues = {};
if (existsSync(secretPath)) {
  for (const line of readFileSync(secretPath, 'utf8').split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 0) continue;
    secretValues[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
}

const projectRef = secretValues['project id'];
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || (projectRef ? `https://${projectRef}.supabase.co` : ''),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || secretValues['public key api'] || secretValues.anon_public || '',
};

const mode = process.argv[2] || 'dev';
const nextBinary = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const args = mode === 'dev' ? ['dev', '--turbopack', '--port', process.argv[3] || '3000'] : [mode];
const child = spawn(process.execPath, [nextBinary, ...args], { stdio: 'inherit', env: environment });
child.on('exit', (code) => { process.exitCode = code ?? 1; });
