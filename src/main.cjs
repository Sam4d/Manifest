const {app,BrowserWindow,ipcMain,dialog,shell}=require('electron');
const path=require('node:path');
const {scan,exportBundle,publicManifest}=require('./scanner.cjs');
let window, current, busy=false;
function authorized(event){if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('Unauthorized sender');}
app.whenReady().then(()=>{
 window=new BrowserWindow({width:1280,height:850,minWidth:950,minHeight:650,backgroundColor:'#10151b',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 window.webContents.on('will-navigate',e=>e.preventDefault());
 window.loadFile(path.join(__dirname,'index.html'));
});
app.on('window-all-closed',()=>app.quit());
ipcMain.handle('scan',async(event,threshold)=>{
 authorized(event);if(busy)throw Error('An operation is already running.');
 if(!Number.isFinite(threshold)||threshold<1||threshold>1000)throw Error('Threshold must be 1–1000 MiB.');
 busy=true;try{
 const pick=await dialog.showOpenDialog(window,{title:'Choose website folder',properties:['openDirectory']});
 if(pick.canceled)return null;
 current=await scan(pick.filePaths[0],{threshold:threshold*1048576},p=>{if(!window.isDestroyed())window.webContents.send('progress',p);});
 return publicManifest(current);
 }finally{busy=false;}
});
ipcMain.handle('export',async event=>{
 authorized(event);if(busy)throw Error('An operation is already running.');if(!current)throw Error('Scan a folder first.');busy=true;
 try{const pick=await dialog.showOpenDialog(window,{title:'Choose destination outside source folder',properties:['openDirectory','createDirectory']});if(pick.canceled)return null;return await exportBundle(current,pick.filePaths[0]);}finally{busy=false;}
});
