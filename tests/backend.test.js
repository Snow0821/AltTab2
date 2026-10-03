import test from 'node:test';
import assert from 'node:assert/strict';
import { publicConfiguration } from '../lib/config.js';
import { questionSchema,attemptSchema } from '../lib/schema.js';
import { originAllowed } from '../lib/auth.js';
import { promptContext } from '../lib/generate.js';
import study from '../api/study.js';
import mcp from '../api/mcp.js';

const id='e138858e-6c6b-46db-9bfb-0543c22e176d';
const question={topic:'메모리',type:'choice',prompt:'가상 메모리의 주요 목적은 무엇인가요?',options:['메모리 추상화','CPU 제거','디스크 삭제'],correct:0,explanation:'가상 메모리는 프로세스에 독립적인 주소 공간을 제공합니다.',materialId:id,page:1};
test('public configuration does not serialize service or LLM credentials',()=>{
  const c=publicConfiguration({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'secret-database',OPENAI_API_KEY:'secret-llm'});
  assert.equal(c.authReady,true);assert.equal(c.aiReady,true);assert.equal(c.mcpReady,true);
  assert.ok(!JSON.stringify(c).includes('secret-'));
  assert.equal(publicConfiguration({}).authReady,false);
  assert.equal(publicConfiguration({SUPABASE_URL:'https://x.supabase.co',SUPABASE_ANON_KEY:'sb_secret_do-not-publish'}).supabaseKey,null);
});
test('model output rejects duplicate choices, bad answer indexes and ungrounded IDs',()=>{
  assert.equal(questionSchema.safeParse(question).success,true);
  assert.equal(questionSchema.safeParse({...question,correct:4}).success,false);
  assert.equal(questionSchema.safeParse({...question,options:['a','a','b']}).success,false);
  assert.equal(questionSchema.safeParse({...question,materialId:'invented'}).success,false);
  assert.equal(questionSchema.safeParse({...question,type:'short'}).success,false);
});
test('attempts cannot reuse a question or accept caller supplied correctness',()=>{
  const responses=Array.from({length:5},()=>({questionId:id,answer:0,correct:true}));
  assert.equal(attemptSchema.safeParse({courseId:id,requestId:id,responses}).success,false);
});
test('origin guard rejects a different website; native MCP can omit Origin',()=>{
  assert.equal(originAllowed({headers:{host:'study.example',origin:'https://evil.example'}}),false);
  assert.equal(originAllowed({headers:{host:'study.example',origin:'https://study.example'}}),true);
  assert.equal(originAllowed({headers:{host:'study.example'}}),true);
});
test('AI source budget preserves material IDs and actual page numbers',()=>{
  const sources=promptContext({materials:[{id,name:'lecture.pdf',pages:[{page:3,text:'a'.repeat(6000)},{page:4,text:'b'.repeat(6000)}]}]},7000);
  assert.equal(sources.reduce((n,p)=>n+p.text.length,0),7000);assert.equal(sources[1].page,4);assert.equal(sources[1].materialId,id);
});
test('study and MCP routes reject unauthenticated requests before running work',async()=>{
  const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://example.supabase.co';process.env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_example';
  try{for(const handler of [study,mcp]){const res={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return this;}};await handler({method:'POST',headers:{host:'study.example'},body:{action:'generate'}},res);assert.equal(res.code,401);}}
  finally{if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;}
});
