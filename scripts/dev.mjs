import http from 'node:http';
import { existsSync } from 'node:fs';
import { createServer } from 'vite';
if(existsSync('.env.local'))process.loadEnvFile('.env.local');
const handlers=Object.fromEntries(await Promise.all(['config','study','mcp'].map(async name=>[name,(await import(`../api/${name}.js`)).default])));
const vite=await createServer({server:{middlewareMode:true},appType:'spa'});
const server=http.createServer(async(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname.match(/^\/api\/(config|study|mcp)$/)?.[1];
  if(!route)return vite.middlewares(req,res);
  res.status=code=>{res.statusCode=code;return res;};
  res.json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));return res;};
  try{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>1000000)return res.status(413).json({error:'Request too large'});}req.body=raw?JSON.parse(raw):undefined;await handlers[route](req,res);}
  catch{if(!res.headersSent)res.status(400).json({error:'Invalid request'});}
});
server.listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('CramMate: http://127.0.0.1:3000'));
process.on('SIGTERM',()=>{server.close();vite.close();});
