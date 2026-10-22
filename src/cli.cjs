#!/usr/bin/env node
const {scan,exportBundle,publicManifest}=require('./scanner.cjs');
(async()=>{
 const [source,destination]=process.argv.slice(2);
 if(!source){console.error('Usage: node src/cli.cjs WEBSITE_FOLDER [EXPORT_PARENT]');process.exitCode=1;return;}
 const result=await scan(source);
 if(destination)console.log(JSON.stringify(await exportBundle(result,destination),null,2));
 else console.log(JSON.stringify(publicManifest(result),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
