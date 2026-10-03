import { createClient } from '@supabase/supabase-js';
import { initialState } from './core.js';
export const connection={user:null,config:{},error:null,loaded:false};
let client;
const demoKey='crammate.demo.v2';
export function demoState(){try{const data=JSON.parse(localStorage.getItem(demoKey));if(data?.courses?.length&&Array.isArray(data.questions)&&Array.isArray(data.history))return data;}catch{}return initialState();}
export function saveDemo(state){try{localStorage.setItem(demoKey,JSON.stringify(state));}catch{/* Private mode/storage quota: UI still works for the session. */}}
export function resetDemo(){localStorage.removeItem(demoKey);return initialState();}
export const emptyState=()=>({courses:[],questions:[],history:[],reviewDue:{},subscriptionUntil:null});
export async function initialize(onChange){
  try{
    const response=await fetch('/api/config');if(!response.ok)throw Error('연결 상태를 확인하지 못했어요.');
    connection.config=await response.json();
    if(connection.config.authReady){
      client=createClient(connection.config.supabaseUrl,connection.config.supabaseKey);
      const {data,error}=await client.auth.getSession();if(error)throw error;
      connection.user=data.session?.user||null;
      client.auth.onAuthStateChange((event,session)=>{
        if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;
        const next=session?.user||null;
        if(next?.id!==connection.user?.id){connection.user=next;queueMicrotask(onChange);}
      });
    }
  }catch{connection.error='서버 연결 상태를 확인하지 못했어요. 샘플 체험은 계속 사용할 수 있어요.';}
  connection.loaded=true;await onChange();
}
export async function authenticate(email,password,signup){
  if(!client)throw Error('아직 로그인 서버가 연결되지 않았어요. AI 연결 화면에서 설정 상태를 확인해 주세요.');
  const {data,error}=await (signup?client.auth.signUp({email,password}):client.auth.signInWithPassword({email,password}));
  if(error)throw Error(signup?'가입하지 못했어요. 이메일·비밀번호를 확인해 주세요.':'이메일 또는 비밀번호를 확인해 주세요. 이메일 인증이 필요한 계정은 받은 편지함도 확인해 주세요.');
  return {verificationRequired:signup&&!data.session};
}
export async function signOut(){const {error}=await client.auth.signOut();if(error)throw Error('로그아웃하지 못했어요. 다시 시도해 주세요.');}
export async function api(action,input={}){
  const {data}=await client.auth.getSession();
  if(!data.session)throw Error('다시 로그인해 주세요.');
  const response=await fetch('/api/study',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},body:JSON.stringify({action,input})});
  let result;try{result=await response.json();}catch{throw Error('서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.');}
  if(!response.ok)throw Error(result.error||'요청을 처리하지 못했어요.');return result;
}
export async function uploadPDF(courseId,file){
  const path=`${connection.user.id}/${courseId}/${crypto.randomUUID()}.pdf`;
  const {error}=await client.storage.from('crammate-materials').upload(path,file,{contentType:'application/pdf',upsert:false});
  if(error)throw Error('PDF를 저장하지 못했어요. 저장소 설정과 파일 크기를 확인해 주세요.');
  try{return await api('material',{courseId,path,name:file.name});}
  catch(e){await client.storage.from('crammate-materials').remove([path]);throw e;}
}
