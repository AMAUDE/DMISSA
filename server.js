// Plateforme DMISSA – serveur statique + API de commentaires (collaboration)
const http=require('http'),fs=require('fs'),path=require('path'),zlib=require('zlib'),{URL}=require('url');
const {DatabaseSync}=require('node:sqlite');
const PORT=process.env.PORT||3000, PUB=path.join(__dirname,'public'), DATA=path.join(__dirname,'data');
const db=new DatabaseSync(path.join(__dirname,'collab.db'));
db.exec(`CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,target TEXT NOT NULL,author TEXT NOT NULL,text TEXT NOT NULL,created TEXT NOT NULL);CREATE INDEX IF NOT EXISTS i_t ON comments(target);`);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.geojson':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const cache=new Map();
function sendFile(req,res,file){
  fs.stat(file,(e,st)=>{
    if(e||!st.isFile()){res.writeHead(404);return res.end('Not found');}
    const ext=path.extname(file), key=file+st.mtimeMs, gz=/gzip/.test(req.headers['accept-encoding']||'')&&['.json','.geojson','.js','.css','.html'].includes(ext);
    const h={'Content-Type':MIME[ext]||'application/octet-stream','Cache-Control':'no-cache'};
    if(!gz){res.writeHead(200,h);return fs.createReadStream(file).pipe(res);}
    h['Content-Encoding']='gzip';
    if(cache.has(key)){res.writeHead(200,h);return res.end(cache.get(key));}
    const buf=zlib.gzipSync(fs.readFileSync(file),{level:6});cache.set(key,buf);res.writeHead(200,h);res.end(buf);
  });
}
function json(res,code,obj){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function body(req){return new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e5)req.destroy();});req.on('end',()=>{try{r(JSON.parse(b))}catch{r(null)}});});}
http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://x');
  if(u.pathname==='/api/comments'&&req.method==='GET'){
    const t=u.searchParams.get('target');
    return json(res,200,db.prepare('SELECT id,author,text,created FROM comments WHERE target=? ORDER BY id DESC LIMIT 200').all(t||''));
  }
  if(u.pathname==='/api/comments/counts'){
    const o={};for(const r of db.prepare('SELECT target,COUNT(*) n FROM comments GROUP BY target').all())o[r.target]=r.n;return json(res,200,o);
  }
  if(u.pathname==='/api/comments'&&req.method==='POST'){
    const b=await body(req);
    if(!b||!/^(plan|zone):\d+$/.test(b.target||'')||!String(b.author||'').trim()||!String(b.text||'').trim())return json(res,400,{error:'invalid'});
    db.prepare('INSERT INTO comments(target,author,text,created) VALUES(?,?,?,?)').run(b.target,String(b.author).trim().slice(0,60),String(b.text).trim().slice(0,1000),new Date().toISOString());
    return json(res,201,{ok:true});
  }
  let p=decodeURIComponent(u.pathname);
  if(p.startsWith('/data/'))return sendFile(req,res,path.join(DATA,path.normalize(p.slice(6)).replace(/^(\.\.[\/])+/,'')));
  if(p==='/')p='/index.html';
  sendFile(req,res,path.join(PUB,path.normalize(p).replace(/^(\.\.[\/])+/,'')));
}).listen(PORT,'0.0.0.0',()=>console.log('Plateforme DMISSA : http://localhost:'+PORT));
