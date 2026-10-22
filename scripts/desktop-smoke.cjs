// Run with Electron, on a graphical desktop or virtual X server.
const {app,dialog}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
let temporary;
async function waitFor(window,expression){for(let i=0;i<200;i++){if(await window.webContents.executeJavaScript(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);}
(async()=>{
 temporary=await fs.mkdtemp(path.join(os.tmpdir(),'sitesieve-desktop-'));
 app.setPath('userData',path.join(temporary,'profile'));
 const source=path.join(temporary,'website'),out=path.join(temporary,'exports');await fs.mkdir(source);await fs.mkdir(out);
 await fs.writeFile(path.join(source,'index.html'),'<title>Desktop fixture</title><main><h1>Hello SiteSieve</h1><video src="movie.mp4"></video></main>');await fs.writeFile(path.join(source,'movie.mp4'),Buffer.alloc(1024));
 let picks=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[picks++===0?source:out]});
 const timer=setTimeout(()=>{console.error('Desktop smoke test timeout');app.exit(1);},20000);
 app.on('browser-window-created',(_event,window)=>{
  window.webContents.once('did-finish-load',async()=>{
   try{
    const errors=[];window.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message);});
    await window.webContents.executeJavaScript("document.getElementById('scan').click()");
    await waitFor(window,"document.getElementById('project-state').textContent==='SCAN COMPLETE'");
    assert.equal(await window.webContents.executeJavaScript("document.getElementById('pages-count').textContent"),'1');
    await window.webContents.executeJavaScript("document.querySelector('[data-view=pages]').click()");
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('.page-card h2').textContent"),'Desktop fixture');
    await window.webContents.executeJavaScript("document.querySelector('[data-view=files]').click(); document.getElementById('search').value='movie'; document.getElementById('search').dispatchEvent(new Event('input'))");
    assert.equal(await window.webContents.executeJavaScript("document.querySelectorAll('#file-list tr').length"),1);
    await window.webContents.executeJavaScript("document.querySelector('[data-view=overview]').click();document.getElementById('export').click()");
    await waitFor(window,"document.getElementById('message').textContent.startsWith('Exported to ')");
    const exports=await fs.readdir(out);assert.equal(exports.length,1);await fs.access(path.join(out,exports[0],'manifest.json'));assert.equal(errors.length,0,errors.join('\n'));
    const image=await window.webContents.capturePage();await fs.writeFile('/tmp/sitesieve-desktop.png',image.toPNG());
    console.log('Desktop smoke PASS: real renderer → preload → native IPC → scanner → export, navigation, filter, and screenshot.');
    clearTimeout(timer);await fs.rm(temporary,{recursive:true,force:true});app.exit(0);
   }catch(e){console.error(e);clearTimeout(timer);app.exit(1);}
  });
 });
 require('../src/main.cjs');
})().catch(e=>{console.error(e);app.exit(1);});
