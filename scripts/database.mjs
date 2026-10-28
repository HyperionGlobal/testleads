import {spawnSync} from 'node:child_process';
const database=new URL(process.env.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(database.hostname)||database.port!=='5432')throw Error('This helper manages only the local PostgreSQL container. Use your managed database for other URLs.');
const inspect=spawnSync('docker',['container','inspect','hyperion-db'],{stdio:'ignore'});
const args=inspect.status===0?['start','hyperion-db']:['run','-d','--name','hyperion-db','-e','POSTGRES_USER','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB','-p','127.0.0.1:5432:5432','-v','hyperion_pgdata:/var/lib/postgresql/data','postgres:16-alpine'];
const result=spawnSync('docker',args,{env:{...process.env,POSTGRES_USER:decodeURIComponent(database.username),POSTGRES_PASSWORD:decodeURIComponent(database.password),POSTGRES_DB:database.pathname.slice(1)},stdio:['ignore','ignore','inherit']});if(result.status!==0)process.exit(result.status||1);
