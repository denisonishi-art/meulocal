import {spawn} from 'node:child_process';

/** Hermes-backed modelTurn for the commercial worker.
 * Invokes `hermes -z "<prompt>"` (one-shot, prints ONLY the final response) as a subprocess.
 * The prompt already instructs JSON-only output; commercial-engine strips fences and validates.
 */
export function createHermesModelTurn({bin='hermes',timeoutMs=120000}={}){
  return async function modelTurn(prompt){
    return await new Promise((resolve,reject)=>{
      const child=spawn(bin,['-z',prompt],{timeout:timeoutMs,stdio:['ignore','pipe','pipe']});
      let out='',err='';
      child.stdout.on('data',d=>{out+=d});
      child.stderr.on('data',d=>{err+=d});
      child.on('error',reject);
      child.on('close',code=>{
        const text=out.trim();
        if(code===0&&text)return resolve(text);
        reject(new Error('hermes_model_exit_'+(code??'signal')+(err?': '+err.slice(0,160):': no_output')));
      });
    });
  };
}
