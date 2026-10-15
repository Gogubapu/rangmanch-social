const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname);
const dataFile = path.join(root, 'indianfeed-data.json');
const crypto = require('node:crypto');
function readData(){ try{return JSON.parse(fs.readFileSync(dataFile,'utf8'));}catch{return {users:[],posts:[]};} }
function writeData(data){fs.writeFileSync(dataFile, JSON.stringify(data,null,2));}
function json(res,status,payload){res.writeHead(status,{'Content-Type':'application/json'}).end(JSON.stringify(payload));}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8' };
function readJson(req, maxBytes = 300000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > maxBytes) reject(new Error('Request is too large.')); });
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Request body must be valid JSON.')); } });
    req.on('error', reject);
  });
}

http.createServer((req, res) => {
  const routePath = new URL(req.url, 'http://localhost').pathname;
  if (routePath === '/login' || routePath === '/signup') {
    const page = routePath === '/login' ? 'login.html' : 'signup.html';
    fs.readFile(path.join(root, page), (error, data) => { if (error) { res.writeHead(404).end('Page not found'); return; } res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(data); });
    return;
  }
  const pathname = new URL(req.url,'http://localhost').pathname;
  if(pathname.startsWith('/api/auth') || pathname === '/api/posts'){
    (async()=>{const data=readData(); let body={}; try{if(req.method==='POST')body=await readJson(req);}catch(e){return json(res,400,{error:e.message});}
      if(pathname==='/api/auth/signup'&&req.method==='POST'){const email=String(body.email||'').trim().toLowerCase(),password=String(body.password||'');if(!/^\S+@\S+\.\S+$/.test(email)||password.length<6)return json(res,400,{error:'Use a valid email and a password with at least 6 characters.'});if(data.users.some(u=>u.email===email))return json(res,409,{error:'An account with this email already exists.'});const user={id:crypto.randomUUID(),email,password,name:String(body.name||email.split('@')[0]).trim()||'RangManch user',username:(String(body.username||email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,20)||'user')};data.users.push(user);writeData(data);return json(res,201,{user:{id:user.id,email:user.email,name:user.name,username:user.username}})}
      if(pathname==='/api/auth/login'&&req.method==='POST'){const user=data.users.find(u=>u.email===String(body.email||'').toLowerCase()&&u.password===String(body.password||''));if(!user)return json(res,401,{error:'Email or password is incorrect.'});return json(res,200,{user:{id:user.id,email:user.email,name:user.name,username:user.username}})}
      if(pathname==='/api/posts'&&req.method==='GET')return json(res,200,{posts:data.posts});
      if(pathname==='/api/posts'&&req.method==='POST'){if(!body.userId||!body.caption||!body.image)return json(res,400,{error:'Add an image and caption.'});const user=data.users.find(u=>u.id===body.userId);if(!user)return json(res,401,{error:'Please log in again.'});const post={id:crypto.randomUUID(),user:user.username,name:user.name,image:String(body.image),caption:String(body.caption),likes:0,comments:0,time:'JUST NOW'};data.posts.unshift(post);writeData(data);return json(res,201,{post});}
    })(); return;
  }
  const filePathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const requested = filePathname === '/' ? '/index.html' : filePathname;
  const target = path.resolve(root, `.${requested}`);
  if (!target.startsWith(root + path.sep) && target !== path.join(root, 'index.html')) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  });
}).listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => {
  console.log(`RangManch ready at http://localhost:${Number(process.env.PORT) || 3000}`);
});
