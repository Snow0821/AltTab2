export function safePublicKey(key){
  if(!key || key.startsWith('sb_secret_'))return undefined;
  if(key.startsWith('eyJ')){
    try{if(JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role!=='anon')return undefined;}catch{return undefined;}
  }
  return key;
}
export function configuration(env = process.env) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.VITE_SUPABASE_URL;
  const publicKey = safePublicKey(env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY);
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  const gateway = Boolean(env.AI_GATEWAY_API_KEY);
  const llmKey = gateway ? env.AI_GATEWAY_API_KEY : env.OPENAI_API_KEY;
  return {url, publicKey, serviceKey, llmKey,
    llmUrl: gateway ? 'https://ai-gateway.vercel.sh/v1' : (env.OPENAI_BASE_URL || 'https://api.openai.com/v1'),
    model: env.LLM_MODEL || env.OPENAI_MODEL || (gateway ? 'openai/gpt-4.1-mini' : 'gpt-4.1-mini')};
}
export function publicConfiguration(env = process.env) {
  const c = configuration(env);
  // Never serialize the full config: service/LLM keys belong only on the server.
  return {supabaseUrl:c.url || null, supabaseKey:c.publicKey || null,
    authReady:Boolean(c.url && c.publicKey), aiReady:Boolean(c.llmKey),
    mcpReady:Boolean(c.url && c.publicKey && c.serviceKey), version:'0.2.0'};
}
