import {existsSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
if(!existsSync('.env')){writeFileSync('.env',`DATABASE_URL="postgresql://hyperion:${randomBytes(24).toString('hex')}@127.0.0.1:5432/hyperion"\nAUTH_SECRET="${randomBytes(48).toString('hex')}"\nADMIN_EMAIL="admin@hyperion.local"\nADMIN_PASSWORD="${randomBytes(18).toString('base64url')}"\nAPP_URL="http://localhost:3000"\nCRON_SECRET="${randomBytes(32).toString('hex')}"\n`,{mode:0o600});console.log('Created ignored .env with random local credentials. Read ADMIN_PASSWORD locally to sign in.');}
