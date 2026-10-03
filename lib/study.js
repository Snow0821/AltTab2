import { randomUUID,createHash } from 'node:crypto';
import { extractText } from 'unpdf';
import { checked,AppError } from './auth.js';
import { courseSchema,generationSchema,attemptSchema } from './schema.js';
import { applyResult,scoreAnswer } from '../core.js';

export const rows=(ctx,table)=>ctx.db.from(`crammate_${table}`);
export async function getCourse(ctx,id){
  const c=checked(await rows(ctx,'courses').select('*').eq('id',id).eq('owner_id',ctx.userId).maybeSingle());
  if(!c)throw new AppError('과목을 찾을 수 없어요.',404);
  return c;
}
const courseView=c=>({...c.data,id:c.id,version:c.version,entitled:true,materials:[]});
const questionView=q=>({...q.data,id:q.id,course:q.course_id,status:q.status});
export async function loadState(ctx){
  const [cs,qs,ms,hs]=await Promise.all([
    rows(ctx,'courses').select('*').eq('owner_id',ctx.userId).order('created_at'),
    rows(ctx,'questions').select('*').eq('owner_id',ctx.userId).order('created_at').limit(2000),
    rows(ctx,'materials').select('id,course_id,name,page_count,sha256').eq('owner_id',ctx.userId),
    rows(ctx,'attempts').select('data').eq('owner_id',ctx.userId).order('created_at',{ascending:false}).limit(200)
  ]);
  const materials=checked(ms),courses=checked(cs).map(c=>({...courseView(c),materials:materials.filter(m=>m.course_id===c.id).map(m=>({id:m.id,name:m.name,pages:m.page_count,hash:m.sha256,sample:false}))}));
  return {courses,questions:checked(qs).map(questionView),history:checked(hs).map(h=>h.data),reviewDue:Object.assign({},...courses.map(c=>c.reviewDue||{})),subscriptionUntil:null};
}
export async function createCourse(ctx,input){
  const d=courseSchema.parse(input);
  const count=await rows(ctx,'courses').select('id',{count:'exact',head:true}).eq('owner_id',ctx.userId);
  checked(count);if(count.count>=30)throw new AppError('과목은 최대 30개까지 만들 수 있어요.');
  return checked(await rows(ctx,'courses').insert({owner_id:ctx.userId,data:{...d,code:'MY COURSE',color:'indigo',topics:[],mastery:[],reviewDue:{}}}).select('id').single());
}
export async function finishAttempt(ctx,input){
  const p=attemptSchema.parse(input);
  const existing=checked(await rows(ctx,'attempts').select('data').eq('id',p.requestId).eq('owner_id',ctx.userId).eq('course_id',p.courseId).maybeSingle());
  if(existing)return existing.data;
  const c=await getCourse(ctx,p.courseId);
  const bank=checked(await rows(ctx,'questions').select('*').eq('owner_id',ctx.userId).eq('course_id',c.id).eq('status','approved').in('id',p.responses.map(r=>r.questionId))).map(questionView);
  if(bank.length!==p.responses.length)throw new AppError('변경된 문항이 있어요. 퀴즈를 다시 시작해 주세요.',409);
  const state={courses:[courseView(c)],questions:bank,history:[],reviewDue:c.data.reviewDue||{}};
  const responses=p.responses.map(r=>({...r,correct:scoreAnswer(bank.find(q=>q.id===r.questionId),r.answer)}));
  const result=applyResult(state,c.id,responses);result.id=p.requestId;
  result.questions=bank; // Immutable explanations survive later question edits/deletion.
  return checked(await ctx.db.rpc('crammate_save_attempt',{p_owner:ctx.userId,p_course:c.id,p_version:c.version,p_id:p.requestId,p_result:result,p_course_data:{...c.data,mastery:state.courses[0].mastery,reviewDue:state.reviewDue}}));
}
export async function review(ctx,id,status){
  if(!['approved','rejected','deleted'].includes(status))throw new AppError('잘못된 검수 상태예요.');
  const updated=checked(await rows(ctx,'questions').update({status}).eq('id',id).eq('owner_id',ctx.userId).select('id'));
  if(!updated.length)throw new AppError('문항을 찾을 수 없어요.',404);
  return {ok:true};
}
export async function finalizeMaterial(ctx,input){
  const c=await getCourse(ctx,input.courseId);
  if(typeof input.path!=='string' || !input.path.startsWith(`${ctx.userId}/${c.id}/`) || input.path.includes('..'))throw new AppError('잘못된 파일 경로예요.');
  const ms=checked(await rows(ctx,'materials').select('id').eq('course_id',c.id).eq('owner_id',ctx.userId));
  if(ms.length>=20)throw new AppError('과목당 교안은 최대 20개까지 추가할 수 있어요.');
  const blob=checked(await ctx.db.storage.from('crammate-materials').download(input.path));
  if(blob.size<1024 || blob.size>50*1024*1024)throw new AppError('1KB~50MB PDF만 사용할 수 있어요.');
  const bytes=new Uint8Array(await blob.arrayBuffer());
  if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw new AppError('유효한 PDF가 아니에요.');
  const hash=createHash('sha256').update(bytes).digest('hex');
  let pdf;try{pdf=await extractText(bytes,{mergePages:false});}catch{throw new AppError('PDF를 읽지 못했어요. 암호 설정을 해제한 파일을 사용해 주세요.');}
  if(pdf.totalPages>500)throw new AppError('500쪽 이하의 PDF를 사용해 주세요.');
  let length=0;const pages=pdf.text.map((text,i)=>{const content=text.slice(0,12000);length+=content.length;return {page:i+1,text:content};});
  if(length>1000000)throw new AppError('교안을 여러 PDF로 나누어 올려 주세요. 추출 텍스트가 너무 많아요.');
  if(pages.reduce((n,p)=>n+p.text.trim().length,0)<100)throw new AppError('텍스트가 없는 스캔 PDF예요. 현재는 글자를 선택할 수 있는 PDF만 분석할 수 있어요.');
  return checked(await rows(ctx,'materials').insert({owner_id:ctx.userId,course_id:c.id,name:String(input.name||'교안.pdf').slice(0,180),storage_path:input.path,sha256:hash,size_bytes:blob.size,pages,page_count:pages.length}).select('id').single());
}
export async function courseContext(ctx,courseId){
  const c=await getCourse(ctx,courseId);
  const materials=checked(await rows(ctx,'materials').select('id,name,pages').eq('owner_id',ctx.userId).eq('course_id',courseId).order('created_at'));
  return {course:{id:c.id,name:c.data.name,topics:c.data.topics},materials};
}
export async function submitQuestions(ctx,courseId,input){
  const parsed=generationSchema.parse(input),c=await getCourse(ctx,courseId);
  const context=await courseContext(ctx,courseId),topics=[...(c.data.topics||[])],mastery=[...(c.data.mastery||[])];
  const seen=new Set();
  const questions=parsed.questions.map(q=>{
    const m=context.materials.find(m=>m.id===q.materialId);
    if(!m?.pages.some(p=>p.page===q.page))throw new AppError('문항의 교안·페이지 근거가 올바르지 않아요. 다시 생성해 주세요.');
    const key=q.prompt.trim().toLowerCase();if(seen.has(key))throw new AppError('생성 결과에 중복 문항이 있어요. 다시 시도해 주세요.');seen.add(key);
    if(!topics.includes(q.topic)){topics.push(q.topic);mastery.push(0);}
    return {...q,topic:topics.indexOf(q.topic),topicName:q.topic,source:`${m.name} · ${q.page}쪽`};
  });
  checked(await ctx.db.rpc('crammate_submit_questions',{p_owner:ctx.userId,p_course:courseId,p_version:c.version,p_course_data:{...c.data,topics,mastery},p_questions:questions}));
  return {count:questions.length,status:'pending'};
}
