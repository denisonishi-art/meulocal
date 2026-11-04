/** Direct DeepSeek (OpenAI-compatible) model turn — the same engine Hermes uses,
 * but with ZERO tool execution. A prospect's message can only ever be prompt text;
 * there is no agent loop, no terminal, no browser, no filesystem. */
export function createDeepSeekModelTurn({apiKey,baseUrl='https://api.deepseek.com/v1',model='deepseek-v4-pro',timeoutMs=90000,maxConcurrent=2,maxTokens=2000,fetchImpl=fetch}={}){
  if(!apiKey)throw Error('DEEPSEEK_API_KEY_required');
  let active=0;const queue=[];
  const acquire=()=>new Promise((resolve,reject)=>{if(active<maxConcurrent){active++;resolve()}else queue.push(resolve)});
  const release=()=>{active--;const next=queue.shift();if(next)next()};
  return async function modelTurn(prompt){
    await acquire();
    try{
      const res=await fetchImpl(baseUrl+'/chat/completions',{
        method:'POST',
        headers:{Authorization:'Bearer '+apiKey,'Content-Type':'application/json'},
        body:JSON.stringify({model,messages:[{role:'user',content:prompt}],temperature:0.2,max_tokens:maxTokens}),
        signal:AbortSignal.timeout(timeoutMs)
      });
      if(!res.ok)throw Error('deepseek_http_'+res.status);
      const data=await res.json();
      const text=data?.choices?.[0]?.message?.content;
      if(typeof text!=='string'||!text.trim())throw Error('deepseek_empty_response');
      return text.trim();
    }finally{release()}
  };
}
