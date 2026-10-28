import { db } from './db';
import { extractSignal, safeFetch, allowedHosts, parseFeed, stripMarkup } from './providers';
import { extractionSchema, Extraction, normalizeName, normalizeUrl, similarity, scoreLead, defaultWeights, draftOutreach, retryDelay, isSuppressed } from './domain';
export async function ingest(input:{title:string;text:string;url:string;company?:string;sourceId?:string;sourceName?:string;demo?:boolean;extraction?:Extraction},actor='worker'){
 const url=normalizeUrl(input.url);
 const existing=await db.sourceDocument.findUnique({where:{url}});
 if(existing){
 if(existing.text!==input.text.slice(0,100000)){
 const refreshed=extractionSchema.parse(input.extraction||await extractSignal(input.title,input.text,url,input.company));
 const rules=await db.scoringRule.findMany();const weights={...defaultWeights};for(const rule of rules)if(rule.key in weights)weights[rule.key as keyof typeof weights]=rule.weight;
 const links=await db.signal.findMany({where:{documentId:existing.id},include:{opportunities:{include:{contacts:true}}}});
 await db.$transaction(async tx=>{
 await tx.auditLog.create({data:{actor,action:'source_content_changed',entity:existing.id,details:{previousTitle:existing.title,previousExcerpt:existing.text.slice(0,1500),previousSignals:links.map(l=>({headline:l.headline,facts:l.facts,inference:l.inference}))}}});
 await tx.sourceDocument.update({where:{id:existing.id},data:{title:input.title,text:input.text.slice(0,100000)}});
 const services=await Promise.all(refreshed.recommended_services.map(name=>tx.service.upsert({where:{name},create:{name},update:{}})));
 const materials=await Promise.all(refreshed.likely_materials.map(name=>tx.material.upsert({where:{name},create:{name},update:{}})));
 for(const signal of links){await tx.signal.update({where:{id:signal.id},data:{headline:refreshed.headline,summary:refreshed.confirmed_facts.join(' '),facts:refreshed.confirmed_facts,inference:refreshed.commercial_inference,materials:refreshed.likely_materials,services:refreshed.recommended_services,urgency:refreshed.estimated_urgency,confidence:refreshed.confidence_score,evidence:input.text.slice(0,1500),verifiedAt:new Date()}});
 for(const op of signal.opportunities){await tx.opportunity.update({where:{id:op.id},data:{name:refreshed.headline,...scoreLead(refreshed,weights,op.contacts.length>0),reviewStatus:'Pending review',services:{set:services.map(x=>({id:x.id}))},materials:{set:materials.map(x=>({id:x.id}))},activities:{create:{actor,description:'Source content changed; requalified and returned to human review. Previous evidence retained in audit.'}}}});await tx.outreachDraft.updateMany({where:{opportunityId:op.id},data:{status:'Superseded — source changed',approvedAt:null,approvedBy:null}});const current=await tx.opportunity.findUniqueOrThrow({where:{id:op.id},include:{companies:true,contacts:true}});const suppression=(await tx.suppression.findMany()).map(x=>x.value);if(!current.companies.some(c=>isSuppressed(null,c.domain,suppression))&&!current.contacts.some(c=>isSuppressed(c.email,null,suppression)))await tx.outreachDraft.create({data:{opportunityId:op.id,tone:'Direct',content:draftOutreach(refreshed.company_name,refreshed.headline,refreshed.recommended_services)}});}
 }
 });return {duplicate:true,updated:true,id:links[0]?.opportunities[0]?.id||existing.id};
 }
 await db.signal.updateMany({where:{documentId:existing.id},data:{verifiedAt:new Date()}});
 await db.auditLog.create({data:{actor,action:'duplicate_prevented',entity:existing.id,details:{reason:'source URL'}}});return {duplicate:true,id:existing.id};
 }
 const s=extractionSchema.parse(input.extraction||await extractSignal(input.title,input.text,url,input.company));
 if(!s.is_relevant)return {irrelevant:true};
 const cfg=await db.setting.findUnique({where:{key:'preferences'}});const threshold=Number((cfg?.value as any)?.duplicateThreshold??.85);
 const candidates=await db.signal.findMany({where:{companyName:s.company_name},take:100});
 const similar=candidates.find(c=>similarity(c.headline,s.headline)>=threshold);
 const weights=await db.scoringRule.findMany();const w={...defaultWeights};for(const row of weights)if(row.key in w)w[row.key as keyof typeof w]=row.weight;
 const penalty=similar?['Existing duplicate']:[];if(/residential.only/i.test(s.confirmed_facts.join(' ')))penalty.push('Residential-only opportunity');if(/unknown/i.test(s.company_name))penalty.push('Unverified company');if(s.publication_date&&Date.now()-new Date(s.publication_date).getTime()>180*86400000)penalty.push('Old signal');
 const scored=scoreLead(s,w,false,penalty);
 return db.$transaction(async tx=>{
 const company=await tx.company.upsert({where:{normalizedName:normalizeName(s.company_name)},create:{name:s.company_name,normalizedName:normalizeName(s.company_name),location:Object.values(s.location).join(', '),demo:input.demo||false,profile:{legalName:{value:s.company_name,status:'Unknown'},website:{value:'Unknown',status:'Unknown'},description:{value:'Research required',status:'Unknown'}}},update:{}});
 const suppression=(await tx.suppression.findMany()).map(x=>x.value);const suppressed=isSuppressed(null,company.domain,suppression);
 const facility=s.facility_name&&!/unknown/i.test(s.facility_name)?await tx.facility.upsert({where:{companyId_address:{companyId:company.id,address:Object.values(s.location).join(', ')}},create:{companyId:company.id,name:s.facility_name,address:Object.values(s.location).join(', ')},update:{}}):null;
 const date=(x:string)=>x&&!Number.isNaN(Date.parse(x))?new Date(x):null;
 const doc=await tx.sourceDocument.create({data:{url,title:input.title,text:input.text.slice(0,100000),sourceName:input.sourceName||'Manual input',publicationDate:date(s.publication_date)}});
 const signal=await tx.signal.create({data:{headline:s.headline,category:s.signal_type,companyName:s.company_name,location:Object.values(s.location).join(', '),summary:s.confirmed_facts.join(' '),facts:s.confirmed_facts,inference:s.commercial_inference,materials:s.likely_materials,services:s.recommended_services,urgency:s.estimated_urgency,projectSize:s.estimated_project_size,confidence:s.confidence_score,evidence:input.text.slice(0,1500),sourceId:input.sourceId,documentId:doc.id,eventDate:date(s.event_date),demo:input.demo||false}});
 const services=await Promise.all(s.recommended_services.map(name=>tx.service.upsert({where:{name},create:{name},update:{}})));
 const materials=await Promise.all(s.likely_materials.map(name=>tx.material.upsert({where:{name},create:{name},update:{}})));
 const op=await tx.opportunity.create({data:{name:s.headline,...scored,breakdown:scored.breakdown,location:signal.location,industry:company.industry,urgency:s.estimated_urgency,projectSize:s.estimated_project_size,demo:input.demo||false,duplicateOf:similar?.id,reviewStatus:similar?'Duplicate review':'Pending review',companies:{connect:{id:company.id}},...(facility?{facilities:{connect:{id:facility.id}}}:{}),signals:{connect:{id:signal.id}},documents:{connect:{id:doc.id}},services:{connect:services.map(v=>({id:v.id}))},materials:{connect:materials.map(v=>({id:v.id}))},...(suppressed?{}:{drafts:{create:{tone:'Direct',content:draftOutreach(company.name,s.headline,s.recommended_services)}}}),activities:{create:{actor,description:'Signal qualified; opportunity and outreach draft created for human review.'}}}});
 const campaigns=await tx.campaign.findMany({where:{enabled:true}});for(const campaign of campaigns){if((campaign.keywords as string[]).some(k=>(s.headline+' '+s.signal_type).toLowerCase().includes(k.toLowerCase())))await tx.opportunity.update({where:{id:op.id},data:{campaigns:{connect:{id:campaign.id}}}});}
 await tx.auditLog.create({data:{actor,action:similar?'duplicate_flagged':'opportunity_created',entity:op.id}});return {id:op.id,duplicate:!!similar};
 });
}
export async function runJob(id:string){
 const claimed=await db.job.updateMany({where:{id,status:'Queued',runAt:{lte:new Date()}},data:{status:'Running',lockedAt:new Date(),attempts:{increment:1}}});if(!claimed.count)return;
 const job=await db.job.findUniqueOrThrow({where:{id},include:{source:true}});try{
 if(!job.source?.enabled)throw Error('Source is disabled or missing');const source=job.source;if(!source.url)throw Error('Source URL required');
 await db.source.update({where:{id:source.id},data:{lastChecked:new Date(),status:'Checking'}});
 const content=await safeFetch(source.url,await allowedHosts());const items=source.type==='RSS'?parseFeed(content):[{title:source.name,text:stripMarkup(content),url:source.url}];let created=0;
 for(const item of items){const result=await ingest({...item,sourceId:source.id,sourceName:source.name});if(result.id&&!result.duplicate)created++;}
 await db.source.update({where:{id:source.id},data:{lastSuccess:new Date(),status:'Healthy'}});await db.job.update({where:{id},data:{status:'Completed',result:{created,processed:items.length},error:null}});
 }catch(e){const message=e instanceof Error?e.message:'Unknown source error';await db.job.update({where:{id},data:{status:job.attempts<job.maxAttempts?'Queued':'Failed',runAt:new Date(Date.now()+retryDelay(job.attempts)*1000),error:message,lockedAt:null}});if(job.sourceId)await db.source.update({where:{id:job.sourceId},data:{status:'Error'}});console.error(JSON.stringify({event:'job_failed',jobId:id,attempt:job.attempts,error:message}));}
}
export async function tick(){const paused=await db.setting.findUnique({where:{key:'paused'}});if(paused?.value===true)return;
 await db.job.updateMany({where:{status:'Running',lockedAt:{lt:new Date(Date.now()-15*60000)},attempts:{lt:3}},data:{status:'Queued',lockedAt:null}});
 await db.job.updateMany({where:{status:'Running',lockedAt:{lt:new Date(Date.now()-15*60000)},attempts:{gte:3}},data:{status:'Failed',error:'Worker lease expired'}});
 const sources=await db.source.findMany({where:{enabled:true}});for(const s of sources){if(!s.lastChecked||Date.now()-s.lastChecked.getTime()>s.frequency*60000){await db.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${s.id}))`;if(!await tx.job.findFirst({where:{sourceId:s.id,status:{in:['Queued','Running']}}}))await tx.job.create({data:{sourceId:s.id}});});}}
 const jobs=await db.job.findMany({where:{status:'Queued',runAt:{lte:new Date()}},take:5,orderBy:{runAt:'asc'}});for(const j of jobs)await runJob(j.id);
}
export async function recalculateOpportunity(id:string){const o=await db.opportunity.findUniqueOrThrow({where:{id},include:{signals:true,contacts:true}});const s=o.signals[0];if(!s)return;const rules=await db.scoringRule.findMany();const weights={...defaultWeights};for(const row of rules)if(row.key in weights)weights[row.key as keyof typeof weights]=row.weight;const parts=s.location.split(', ');const extraction=extractionSchema.parse({is_relevant:true,signal_type:s.category,headline:s.headline,company_name:s.companyName,facility_name:'',location:{city:parts[0]||'Unknown',state:parts[1]||'Unknown',country:parts.at(-1)||'Unknown'},publication_date:'',event_date:'',confirmed_facts:s.facts,commercial_inference:s.inference,likely_materials:s.materials,recommended_services:s.services,estimated_urgency:s.urgency,estimated_project_size:s.projectSize,contact_departments:[],source_url:'https://example.com/scoring-context',confidence_score:s.confidence});const penalties=o.duplicateOf?['Existing duplicate']:[];if(/unknown/i.test(s.companyName))penalties.push('Unverified company');const result=scoreLead(extraction,weights,o.contacts.length>0,penalties);await db.opportunity.update({where:{id},data:result});}
