'use strict';
const fs=require('node:fs');
function credentialEnvironment(inherited,readFile=file=>fs.readFileSync(file,'utf8')){
 const selected={...inherited};
 if(inherited.OPENDOTS_ENV_FILE)for(const line of readFile(inherited.OPENDOTS_ENV_FILE).split('\n')){
  const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
  if(match)selected[match[1]]=match[2].trim().replace(/^(['"])(.*)\1$/,'$2');
 }
 return selected;
}
module.exports={credentialEnvironment};
