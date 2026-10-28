import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { compare, hash } from 'bcryptjs';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { db } from '@/lib/db';
import { audit, createSession, getUser, rateLimit } from '@/lib/auth';
import { ingest, runJob, recalculateOpportunity } from '@/lib/pipeline';
import { allowedHosts, safeFetch, stripMarkup, BraveSearch, ApolloContacts } from '@/lib/providers';
import { csvCell, stages, normalizeName, validateContact, isSuppressed, draftOutreach, defaultWeights } from '@/lib/domain';
export const runtime='nodejs';
const json=(data:unknown,status=200)=>NextResponse.json(data,{status});
const include={companies:true,contacts:true,services:true,materials:true,signals:{include:{document:true}},drafts:{orderBy:{createdAt:'desc' as const}},notes:true,tasks:true,activities:{orderBy:{createdAt:'desc' as const}},campaigns:true};
async function readBody(req:NextRequest){const raw=await req.text();if(Buffer.byteLength(raw)>2_000_000)throw Error('Request exceeds 2MB');return JSON.parse(raw||'{}');}
async function handle(req:NextRequest,context:{params:Promise<{path:string[]}>}){
 const path=(await context.params).path.join('/');const method=req.method;
 try{
 if(path==='health'){await db.$queryRaw`SELECT 1`;return json({application:'Hyperion Lead Intelligence',status:'ok',database:'connected',mode:process.env.OPENAI_API_KEY?'AI enabled':'demonstration / rule-based',emailSending:false});}
 if(method!=='GET'){const origin=req.headers.get('origin');if(!origin||origin!==new URL(process.env.APP_URL||req.url).origin)return json({error:'Invalid request origin'},403);}
 if(path==='auth/login'&&method==='POST'){
 const b=z.object({email:z.email(),password:z.string().min(1).max(200)}).parse(await readBody(req));
 await rateLimit('login:global',100,15*60000);await rateLimit('login:'+b.email.toLowerCase(),10,15*60000);
 const u=await db.user.findUnique({where:{email:b.email.toLowerCase()}});if(!u||!await compare(b.password,u.passwordHash))return json({error:'Invalid email or password'},401);
 (await cookies()).set('hyperion_session',await createSession(u),{httpOnly:true,secure:process.env.APP_URL?.startsWith('https://')||false,sameSite:'lax',path:'/',maxAge:28800});await audit(u.email,'login',u.id);return json({ok:true});}
 const user=await getUser();if(!user)return json({error:'Authentication required'},401);
 await rateLimit('user:'+user.id,180);
 if(path==='auth/logout'&&method==='POST'){(await cookies()).delete('hyperion_session');return json({ok:true});}
 if(path==='me')return json(user);
 if(method==='GET'){
 if(path==='opportunities')return json(await db.opportunity.findMany({include,orderBy:{score:'desc'},take:500}));
 if(path.startsWith('opportunities/'))return json(await db.opportunity.findUnique({where:{id:path.split('/')[1]},include}));
 if(path==='companies')return json(await db.company.findMany({include:{contacts:true,facilities:true,opportunities:{select:{id:true,name:true,score:true}}},orderBy:{name:'asc'}}));
 if(path==='contacts')return json(await db.contact.findMany({include:{company:true}}));
 if(path==='signals')return json(await db.signal.findMany({include:{document:true,opportunities:{select:{id:true}}},orderBy:{discoveredAt:'desc'}}));
 if(path==='sources')return json(await db.source.findMany({include:{_count:{select:{signals:true}},jobs:{take:5,orderBy:{createdAt:'desc'}}},orderBy:{name:'asc'}}));
 if(path==='campaigns')return json(await db.campaign.findMany({include:{opportunities:{select:{id:true,name:true,score:true}}}}));
 if(path==='searches')return json(await db.savedSearch.findMany());
 if(path==='imports')return json(await db.import.findMany({orderBy:{createdAt:'desc'}}));
 if(path==='audit')return json(await db.auditLog.findMany({take:200,orderBy:{createdAt:'desc'}}));
 if(path==='jobs')return json(await db.job.findMany({include:{source:true},take:100,orderBy:{createdAt:'desc'}}));
 if(path==='settings')return json({settings:await db.setting.findMany(),weights:await db.scoringRule.findMany(),suppression:await db.suppression.findMany(),users:await db.user.findMany({select:{id:true,email:true,role:true,name:true}}),providers:{ai:!!process.env.OPENAI_API_KEY,search:!!process.env.SEARCH_API_KEY,contacts:!!process.env.CONTACT_ENRICHMENT_API_KEY,emailVerification:!!process.env.EMAIL_VERIFICATION_API_KEY},usage:await db.usage.aggregate({_sum:{tokens:true,calls:true,costUsd:true}})});
 if(path==='import-template')return new NextResponse('company,title,text,url,industry,location\nExample Company,Warehouse closure,Company reports a warehouse closure,https://example.com/source,Warehousing,Texas\n',{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="hyperion-import-template.csv"'}});
 if(path==='export'){
 const format=req.nextUrl.searchParams.get('format')||'csv';if(!['csv','xlsx','json'].includes(format))throw Error('Unsupported export format');
 const rows=(await db.opportunity.findMany({include})).map(o=>({id:o.id,opportunity:o.name,company:o.companies.map(c=>c.name).join('; '),score:o.score,priority:o.priority,stage:o.stage,location:o.location,industry:o.industry,services:o.services.map(s=>s.name).join('; '),demo:o.demo,review:o.reviewStatus}));await db.export.create({data:{format,actor:user.email,count:rows.length}});await audit(user.email,'export',format,{count:rows.length});
 if(format==='json')return new NextResponse(JSON.stringify(rows,null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="hyperion-opportunities.json"'}});
 if(format==='xlsx'){const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Opportunities');sheet.columns=Object.keys(rows[0]||{id:''}).map(key=>({header:key,key,width:25}));rows.forEach(row=>sheet.addRow(row));sheet.getRow(1).font={bold:true};const data=await book.xlsx.writeBuffer();return new NextResponse(new Uint8Array(data),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="hyperion-opportunities.xlsx"'}});}
 const keys=Object.keys(rows[0]||{id:''});return new NextResponse([keys.map(csvCell).join(','),...rows.map(row=>keys.map(k=>csvCell(row[k as keyof typeof row])).join(','))].join('\r\n'),{headers:{'Content-Type':'text/csv','Content-Disposition':'attachment; filename="hyperion-opportunities.csv"'}});
 }
 return json({error:'Not found'},404);
 }
 const b=await readBody(req);
 const adminOnly=['settings','sources','users','retention','search','enrich','jobs','pipeline'];if(adminOnly.includes(path.split('/')[0])&&user.role!=='ADMIN')return json({error:'Administrator role required'},403);
 if(path==='companies'&&method==='POST'){const c=z.object({name:z.string().min(2).max(200),domain:z.string().max(200).optional(),industry:z.string().max(200).default('Unknown'),location:z.string().max(200).default('Unknown')}).parse(b);if(c.domain&&!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(c.domain))throw Error('Enter a domain without a scheme or path');const company=await db.company.create({data:{...c,domain:c.domain?.toLowerCase()||null,normalizedName:normalizeName(c.name)}});await audit(user.email,'company_created',company.id);return json(company,201);}
 if(path==='contacts'&&method==='POST'){const c=z.object({name:z.string().min(2),title:z.string().min(2),companyId:z.string(),email:z.email().optional(),emailStatus:z.enum(['Unknown','Unverified','Inferred','Verified']).default('Unknown'),source:z.string().min(1),reason:z.string().min(1),linkedin:z.url().optional(),phone:z.string().optional()}).parse(b);validateContact(c);const contact=await db.contact.create({data:{...c,verifiedAt:c.emailStatus==='Verified'?new Date():null}});await audit(user.email,'contact_created',contact.id);return json(contact,201);}
 if(path==='ingest'){const data=z.object({title:z.string().min(3).max(300),text:z.string().min(10).max(100000),url:z.url(),company:z.string().max(200).optional()}).parse(b);return json(await ingest(data,user.email));}
 if(path==='fetch-url'){if(user.role!=='ADMIN')return json({error:'Administrator role required'},403);const url=z.url().parse(b.url);const text=stripMarkup(await safeFetch(url,await allowedHosts()));return json(await ingest({url,title:z.string().min(3).parse(b.title),text,company:b.company},user.email));}
 if(path==='imports'){
 const {csv,name}=z.object({csv:z.string().max(1_000_000),name:z.string().max(200).default('CSV import')}).parse(b);const records=parse(csv,{columns:true,skip_empty_lines:true,trim:true,bom:true});if(records.length>500)throw Error('Import limit is 500 rows');let created=0,duplicates=0;const errors:{row:number;error:string}[]=[];
 for(let i=0;i<records.length;i++){try{const r=z.object({company:z.string().min(1),title:z.string().min(3),text:z.string().min(10),url:z.url()}).parse(records[i]);const result=await ingest(r,user.email);if(result.duplicate)duplicates++;else if(result.id)created++;}catch(e){errors.push({row:i+2,error:e instanceof Error?e.message:'Invalid row'});}}
 const record=await db.import.create({data:{name,total:records.length,created,duplicates,errors}});await audit(user.email,'csv_import',record.id,{created,duplicates});return json(record);}
 if(path.startsWith('opportunities/')){
 const id=path.split('/')[1];const action=path.split('/')[2];const op=await db.opportunity.findUniqueOrThrow({where:{id},include});
 if(action==='note'){const body=z.string().min(1).max(5000).parse(b.body);await db.note.create({data:{opportunityId:id,body,author:user.email}});}
 else if(action==='task'){await db.task.create({data:{opportunityId:id,title:z.string().min(1).max(300).parse(b.title),dueAt:b.dueAt?z.iso.datetime().parse(b.dueAt):null}});}
 else if(action==='draft'){const suppress=await db.suppression.findMany();if(op.companies.some(c=>isSuppressed(null,c.domain,suppress.map(s=>s.value)))||op.contacts.some(c=>isSuppressed(c.email,null,suppress.map(s=>s.value))))throw Error('Outreach blocked by suppression list');const tone=z.enum(['Direct','Consultative','Partnership-focused','Urgent','Existing-relationship follow-up']).parse(b.tone||'Direct');if(tone==='Existing-relationship follow-up')throw Error('Existing relationship must be documented; use a neutral tone for this MVP');await db.outreachDraft.create({data:{opportunityId:id,tone,content:draftOutreach(op.companies[0]?.name||'Company',op.name,op.services.map(s=>s.name),tone)}});}
 else if(action==='approve-draft'){const suppress=await db.suppression.findMany();if(op.companies.some(c=>isSuppressed(null,c.domain,suppress.map(s=>s.value)))||op.contacts.some(c=>isSuppressed(c.email,null,suppress.map(s=>s.value))))throw Error('Approval blocked by suppression list');if(op.reviewStatus!=='Approved')throw Error('Approve the opportunity before approving outreach');if(op.drafts.find(d=>d.id===b.draftId)?.status.startsWith('Superseded'))throw Error('Superseded drafts cannot be approved; review the latest draft');await db.outreachDraft.update({where:{id:z.string().parse(b.draftId),opportunityId:id},data:{status:'Approved — manual use only',approvedBy:user.email,approvedAt:new Date()}});}
 else if(action==='delete'){if(user.role!=='ADMIN')return json({error:'Administrator role required'},403);await db.opportunity.delete({where:{id}});await audit(user.email,'opportunity_deleted',id);return json({ok:true});}
 else{const updates=z.object({stage:z.enum(stages as [string,...string[]]).optional(),owner:z.string().max(100).optional(),reviewStatus:z.enum(['Pending review','Approved','Rejected','Duplicate review']).optional(),contactId:z.string().optional()}).parse(b);const {contactId,...rest}=updates;await db.opportunity.update({where:{id},data:{...rest,...(contactId?{contacts:{connect:{id:contactId}}}:{})}});if(contactId)await recalculateOpportunity(id);}
 await db.activity.create({data:{opportunityId:id,actor:user.email,description:`${action||'Opportunity updated'}${b.stage?': '+b.stage:''}${b.reviewStatus?': '+b.reviewStatus:''}`}});await audit(user.email,action||'opportunity_updated',id);return json({ok:true});
 }
 if(path==='tasks'){await db.task.update({where:{id:z.string().parse(b.id)},data:{done:z.boolean().parse(b.done)}});return json({ok:true});}
 if(path==='sources'){if(b.id){await db.source.update({where:{id:z.string().parse(b.id)},data:z.object({enabled:z.boolean().optional(),frequency:z.number().int().min(15).max(525600).optional()}).parse(b)});}else{const data=z.object({name:z.string().min(2).max(200),type:z.enum(['RSS','Website','Government portal','Procurement portal','Company newsroom','Regulatory page','API provider','Manual']),url:z.url().optional(),industry:z.string().default('All'),geography:z.string().default('United States'),frequency:z.number().int().min(15).default(1440)}).parse(b);if(data.url&&!data.url.startsWith('https://'))throw Error('HTTPS required');await db.source.create({data});}await audit(user.email,'source_configured',b.id||'new');return json({ok:true});}
 if(path==='jobs'){const source=await db.source.findUniqueOrThrow({where:{id:z.string().parse(b.sourceId)}});if(!source.enabled)throw Error('Enable source first');const job=await db.job.create({data:{sourceId:source.id}});await runJob(job.id);return json(await db.job.findUnique({where:{id:job.id}}));}
 if(path==='pipeline'){await db.setting.upsert({where:{key:'paused'},create:{key:'paused',value:z.boolean().parse(b.paused)},update:{value:z.boolean().parse(b.paused)}});return json({ok:true});}
 if(path==='search'){const query=z.string().min(3).max(300).parse(b.query);if(process.env.SEARCH_PROVIDER!=='brave')throw Error('Configure SEARCH_PROVIDER=brave and SEARCH_API_KEY');return json(await new BraveSearch().search(query));}
 if(path==='enrich'){const domain=z.string().min(3).parse(b.domain);return json({candidates:await new ApolloContacts().lookup(domain),notice:'Provider candidates require review; no unverified email is labeled verified.'});}
 if(path==='searches'){await db.savedSearch.create({data:{name:z.string().min(1).max(100).parse(b.name),filters:z.object({query:z.string(),stage:z.string().optional(),priority:z.string().optional()}).parse(b.filters)}});return json({ok:true});}
 if(path==='suppression'){if(user.role!=='ADMIN')return json({error:'Administrator role required'},403);const value=z.string().min(3).max(200).parse(b.value).toLowerCase();await db.suppression.upsert({where:{value},create:{value,reason:z.string().min(1).parse(b.reason)},update:{}});await audit(user.email,'suppression_added',value);return json({ok:true});}
 if(path==='settings'){
 if(b.weights){const weights=z.record(z.string(),z.number().int().min(0).max(100)).parse(b.weights);if(Object.values(weights).reduce((a,c)=>a+c,0)!==100||Object.keys(weights).sort().join()!==Object.keys(defaultWeights).sort().join())throw Error('Use all seven scoring weights with a total of 100');await db.$transaction(Object.entries(weights).map(([key,weight])=>db.scoringRule.upsert({where:{key},create:{key,weight},update:{weight}})));}
 if(b.allowedHosts){const hosts=z.array(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i)).max(100).parse(b.allowedHosts);await db.setting.upsert({where:{key:'allowedHosts'},create:{key:'allowedHosts',value:hosts},update:{value:hosts}});}
 if(b.preferences){const preferences=z.object({geographies:z.array(z.string()),priorityStates:z.array(z.string()),duplicateThreshold:z.number().min(.5).max(1),retentionDays:z.number().int().min(1),aiModel:z.string(),currency:z.string(),timeZone:z.string(),outreachTone:z.string(),companyProfile:z.string(),keywords:z.array(z.string()),exclusions:z.array(z.string()),notifications:z.boolean()}).parse(b.preferences);await db.setting.upsert({where:{key:'preferences'},create:{key:'preferences',value:preferences},update:{value:preferences}});}
 await audit(user.email,'settings_updated','settings');return json({ok:true});}
 if(path==='users'){const u=z.object({email:z.email(),name:z.string().min(1),password:z.string().min(12),role:z.enum(['ADMIN','USER'])}).parse(b);const created=await db.user.create({data:{email:u.email.toLowerCase(),name:u.name,passwordHash:await hash(u.password,12),role:u.role}});await audit(user.email,'user_created',created.id);return json({id:created.id},201);}
 if(path==='retention'){const days=Number(((await db.setting.findUnique({where:{key:'preferences'}}))?.value as any)?.retentionDays||365);const result=await db.opportunity.deleteMany({where:{updatedAt:{lt:new Date(Date.now()-days*86400000)},stage:{in:['Lost','Disqualified']}}});await audit(user.email,'retention_applied','opportunities',{deleted:result.count});return json(result);}
 return json({error:'Not found'},404);
 }catch(e){const message=e instanceof Error?e.message:'Request failed';console.error(JSON.stringify({event:'api_error',path,type:e instanceof Error?e.name:'Unknown'}));if(e instanceof z.ZodError)return json({error:'Validation failed',issues:e.issues.map(x=>({path:x.path,message:x.message}))},400);if(message.includes('Unique constraint'))return json({error:'Duplicate record: review the existing company, contact or source instead.'},409);return json({error:message.startsWith('Invalid `')?'Database operation failed':message},message.includes('Rate limit')?429:400);}
}
export const GET=handle;export const POST=handle;export const PATCH=handle;export const DELETE=handle;
