// Owned E2E process only; receives no database credential and has no production entry point.
const http=require('node:http');
process.on('message',message=>{if(message==='stop')process.exit(0);});
import('next').then(async({default:next})=>{
  const port=Number(process.env.FLEETORA_BROWSER_PORT);
  const app=next({dev:true,dir:process.cwd(),hostname:'localhost',port,webpack:true});
  await app.prepare();const server=http.createServer(app.getRequestHandler());server.on('upgrade',app.getUpgradeHandler());
  server.listen(port,'localhost',async()=>{try{const response=await fetch(`http://localhost:${port}/login`);await response.arrayBuffer();if(!response.ok)throw new Error('Warmup failed');process.send?.('ready');}catch{process.exit(1);}});
}).catch(()=>{process.exit(1);});
