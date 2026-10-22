const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {scan,exportBundle,publicManifest,report}=require('../src/scanner.cjs');
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'sieve-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const site=path.join(root,'site'),out=path.join(root,'out');await fs.mkdir(site);await fs.mkdir(out);return {root,site,out};}
test('scans structure and exports source with placeholders without modifying original',async t=>{
 const {site,out}=await fixture(t);await fs.mkdir(path.join(site,'styles'));await fs.mkdir(path.join(site,'media'));
 const html='<title>Example &lt;site&gt;</title><header><nav><a href="about.html">About</a></nav></header><main><h1>Welcome</h1><video src="media/demo.mp4"></video><img src="media/huge.png"><script src="app.js"></script></main>';
 await fs.writeFile(path.join(site,'index.html'),html);await fs.writeFile(path.join(site,'about.html'),'<h1>About</h1>');await fs.writeFile(path.join(site,'app.js'),'throw new Error("MUST NOT EXECUTE");');await fs.writeFile(path.join(site,'styles/main.css'),'body{background:url(../media/huge.png)}');await fs.writeFile(path.join(site,'media/demo.mp4'),Buffer.alloc(4096));await fs.writeFile(path.join(site,'media/huge.png'),Buffer.alloc(4096));await fs.writeFile(path.join(site,'package.json'),JSON.stringify({dependencies:{react:'19'}}));
 const s=await scan(site,{threshold:1024});assert.equal(s.pages.length,2);assert.deepEqual(s.frameworks,['react']);assert.equal(s.files.find(f=>f.path==='index.html').references.find(r=>r.target==='about.html').kind,'local');assert.equal(s.files.find(f=>f.path==='styles/main.css').references[0].resolved,'media/huge.png');assert.equal(s.totalBytes-s.retainedBytes,8192);assert.equal(publicManifest(s).root,undefined);
 const result=await exportBundle(s,out);assert.equal(result.warnings.length,0);assert.equal(await fs.readFile(path.join(site,'index.html'),'utf8'),html);const copy=await fs.readFile(path.join(result.path,'lightweight/index.html'),'utf8');assert(!copy.includes('<video'));assert(copy.includes('SITESIEVE-PLACEHOLDER.svg'));await assert.rejects(fs.stat(path.join(result.path,'lightweight/media/demo.mp4')));const manifest=JSON.parse(await fs.readFile(path.join(result.path,'manifest.json')));assert.equal(manifest.files.length,7);assert.equal(manifest.root,undefined);await fs.access(path.join(result.path,'report.html'));
 const second=await exportBundle(s,out);assert.notEqual(result.path,second.path);
});
test('excludes credentials, caches, and symbolic links and rejects nested exports',async t=>{
 const {site,out}=await fixture(t);await fs.writeFile(path.join(site,'.env.local'),'SECRET=never-export');await fs.mkdir(path.join(site,'node_modules'));await fs.writeFile(path.join(site,'node_modules/dependency.js'),'code');await fs.symlink(out,path.join(site,'linked'));await fs.writeFile(path.join(site,'safe.txt'),'hello');const s=await scan(site);assert.equal(s.files.length,1);assert.equal(s.skipped.length,3);await assert.rejects(exportBundle(s,site),/outside/);const exported=await exportBundle(s,out);await assert.rejects(fs.stat(path.join(exported.path,'lightweight/.env.local')));
});
test('detects changed files and escapes report text',async t=>{
 const {site,out}=await fixture(t);await fs.writeFile(path.join(site,'evil.html'),'<title><script>alert(1)</script></title>');const s=await scan(site);assert(!report(s).includes('<script>'));await fs.writeFile(path.join(site,'evil.html'),'changed');const r=await exportBundle(s,out);assert(r.warnings.some(w=>w.includes('File changed')));
});
test('large binary files are not read as source and large source is retained without parsing',async t=>{
 const {site}=await fixture(t);const f=await fs.open(path.join(site,'large.mp4'),'w');await f.truncate(2500000000);await f.close();await fs.writeFile(path.join(site,'large.js'),' '.repeat(2*1024*1024+1));const s=await scan(site);assert.equal(s.files.find(f=>f.path==='large.mp4').decision,'omit');assert.equal(s.files.find(f=>f.path==='large.js').decision,'keep');assert(s.warnings.some(w=>w.includes('Source parsing skipped')));assert(s.totalBytes>2500000000);
});
test('HTML entities and nested layout are parsed and user files never collide with generated helpers',async t=>{
 const {site,out}=await fixture(t);await fs.writeFile(path.join(site,'index.html'),'<title>A &amp; B</title><main id="app"><section class="hero wide"><h1>Hello &amp; welcome</h1><p>Important content</p></section></main>');await fs.writeFile(path.join(site,'SITESIEVE-PLACEHOLDER.svg'),'original');const s=await scan(site);assert.equal(s.pages[0].title,'A & B');assert.equal(s.pages[0].headings[0].text,'Hello & welcome');assert(s.pages[0].content.includes('Important content'));const layout=JSON.stringify(s.pages[0].layout);assert(layout.includes('hero'));assert(layout.includes('app'));const r=await exportBundle(s,out);assert.equal(await fs.readFile(path.join(r.path,'lightweight/SITESIEVE-PLACEHOLDER.svg'),'utf8'),'original');
});
