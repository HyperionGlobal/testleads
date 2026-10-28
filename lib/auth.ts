import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from './db';
export function secret(){const s=process.env.AUTH_SECRET;if(!s||s.length<32)throw Error('AUTH_SECRET must contain at least 32 characters');return new TextEncoder().encode(s);}
export async function createSession(user:{id:string,sessionVersion:number}){return new SignJWT({ver:user.sessionVersion}).setProtectedHeader({alg:'HS256'}).setSubject(user.id).setIssuedAt().setExpirationTime('8h').sign(secret());}
export async function getUser(){try{const token=(await cookies()).get('hyperion_session')?.value;if(!token)return null;const {payload}=await jwtVerify(token,secret(),{algorithms:['HS256']});const u=await db.user.findUnique({where:{id:payload.sub}});return u&&u.sessionVersion===payload.ver?{id:u.id,name:u.name,email:u.email,role:u.role}:null;}catch{return null;}}
export async function rateLimit(key:string,limit=60,windowMs=60000){const now=new Date();await db.rateLimit.deleteMany({where:{resetAt:{lt:now}}});const row=await db.rateLimit.upsert({where:{key},create:{key,count:1,resetAt:new Date(Date.now()+windowMs)},update:{count:{increment:1}}});if(row.count>limit)throw Error('Rate limit exceeded; try later');}
export async function audit(actor:string,action:string,entity:string,details:object={}){await db.auditLog.create({data:{actor,action,entity,details}});}
