import { createHash,randomBytes } from 'node:crypto';
import { authenticate,checked,AppError,originAllowed,fail } from '../lib/auth.js';
import { loadState,createCourse,finishAttempt,review,finalizeMaterial,rows } from '../lib/study.js';
import { generateQuestions } from '../lib/generate.js';
import { publicConfiguration } from '../lib/config.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  if(!originAllowed(req))return res.status(403).json({error:'허용되지 않은 요청 출처예요.'});
  try{
    const ctx=await authenticate(req),body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||typeof body.action!=='string')throw new AppError('작업이 필요해요.');
    const p=body.input||{};let result;
    switch(body.action){
      case 'load': result=await loadState(ctx);break;
      case 'create-course': result=await createCourse(ctx,p);break;
      case 'attempt': result=await finishAttempt(ctx,p);break;
      case 'review': result=await review(ctx,p.id,p.status);break;
      case 'material': result=await finalizeMaterial(ctx,p);break;
      case 'generate': result=await generateQuestions(ctx,p.courseId);break;
      case 'tokens': result=checked(await rows(ctx,'mcp_tokens').select('id,name,created_at,expires_at,revoked_at').eq('owner_id',ctx.userId).order('created_at',{ascending:false}));break;
      case 'create-token':{
        if(!publicConfiguration().mcpReady)throw new AppError('MCP 서버 키 설정이 필요해요.',503);
        const active=checked(await rows(ctx,'mcp_tokens').select('id').eq('owner_id',ctx.userId).is('revoked_at',null).gt('expires_at',new Date().toISOString()));
        if(active.length>=5)throw new AppError('기존 토큰을 폐기해 주세요. 활성 토큰은 5개까지 가능해요.');
        const token='cm_'+randomBytes(32).toString('hex');
        const record=checked(await rows(ctx,'mcp_tokens').insert({owner_id:ctx.userId,name:String(p.name||'내 AI').slice(0,40),token_hash:createHash('sha256').update(token).digest('hex')}).select('id,expires_at').single());
        result={...record,token};break;
      }
      case 'revoke-token': checked(await rows(ctx,'mcp_tokens').update({revoked_at:new Date().toISOString()}).eq('owner_id',ctx.userId).eq('id',p.id));result={ok:true};break;
      default:throw new AppError('지원하지 않는 작업이에요.',404);
    }
    return res.status(200).json(result);
  }catch(error){return fail(res,error);}
}
