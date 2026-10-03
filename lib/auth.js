import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { configuration } from './config.js';
export class AppError extends Error {
  constructor(message, status=400){super(message);this.status=status;}
}
export function checked(result) {
  if(result.error){
    const e=result.error;
    if(['42P01','PGRST205','PGRST202'].includes(e.code)) throw new AppError('학습 데이터베이스 초기 설정이 필요해요. README의 Supabase 설정을 확인해 주세요.',503);
    if(e.code==='23505') throw new AppError('이미 저장된 자료 또는 문항이에요.',409);
    if(e.message?.includes('CONFLICT')) throw new AppError('다른 화면에서 변경되었어요. 새로고침 후 다시 시도해 주세요.',409);
    if(e.message?.includes('RATE_LIMIT')) throw new AppError('AI 생성은 1분에 한 번, 하루 20회까지 가능해요.',429);
    throw new AppError('학습 데이터를 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',500);
  }
  return result.data;
}
export async function authenticate(req,{allowMcp=false}={}) {
  const c=configuration();
  if(!c.url || !c.publicKey) throw new AppError('Supabase 연결 설정이 필요해요. 지금은 샘플 체험을 이용할 수 있어요.',503);
  const token=(req.headers.authorization || '').match(/^Bearer (\S+)$/i)?.[1];
  if(!token) throw new AppError('로그인이 필요해요.',401);
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  if(token.startsWith('cm_')){
    if(!allowMcp || !c.serviceKey) throw new AppError('이 연결에서는 MCP 토큰을 사용할 수 없어요.',401);
    const db=createClient(c.url,c.serviceKey,options);
    const hash=createHash('sha256').update(token).digest('hex');
    const result=await db.from('crammate_mcp_tokens').select('owner_id,expires_at,revoked_at').eq('token_hash',hash).maybeSingle();
    if(result.error || !result.data || result.data.revoked_at || Date.parse(result.data.expires_at)<Date.now()) throw new AppError('토큰이 만료되었거나 유효하지 않아요.',401);
    return {db,userId:result.data.owner_id,mcp:true};
  }
  const db=createClient(c.url,c.publicKey,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});
  const {data,error}=await db.auth.getUser(token);
  if(error || !data?.user) throw new AppError('로그인이 만료되었어요. 다시 로그인해 주세요.',401);
  return {db,userId:data.user.id,mcp:false};
}
export function originAllowed(req){
  if(!req.headers.origin) return true;
  try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;}
}
export function fail(res,error){
  if(error.name==='ZodError')return res.status(400).json({error:'입력 형식이 올바르지 않아요.'});
  const status=error.status || 500;
  if(status>=500) console.error('crammate_request_failed',{status,name:error.name});
  return res.status(status).json({error:error instanceof AppError ? error.message : '요청을 처리하지 못했어요. 다시 시도해 주세요.'});
}
