const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('siteSieve',{
 scan:threshold=>ipcRenderer.invoke('scan',threshold),
 export:()=>ipcRenderer.invoke('export'),
 onProgress:callback=>{ipcRenderer.on('progress',(_event,data)=>callback(data));}
});
