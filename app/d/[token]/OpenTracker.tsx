'use client';

import {useEffect} from 'react';

export default function OpenTracker({token}:{token:string}){
  useEffect(()=>{
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>|null=null;

    const send=async()=>{
      if(cancelled||document.visibilityState!=='visible'||navigator.webdriver)return;
      const ua=navigator.userAgent||'';
      if(/bot|crawler|spider|preview|facebookexternalhit|whatsapp|slackbot|telegrambot|discordbot|linkedinbot|google-inspectiontool/i.test(ua))return;
      try{
        await fetch('/api/prospect-diagnostic/open',{
          method:'POST',
          headers:{'Content-Type':'application/json','X-MeuLocal-View':'human-client-v1'},
          body:JSON.stringify({token}),
          keepalive:true,
          cache:'no-store'
        });
      }catch{}
    };

    const schedule=()=>{
      if(cancelled||document.visibilityState!=='visible')return;
      if(timer)clearTimeout(timer);
      timer=setTimeout(send,5000);
    };

    schedule();
    document.addEventListener('visibilitychange',schedule);
    return ()=>{
      cancelled=true;
      if(timer)clearTimeout(timer);
      document.removeEventListener('visibilitychange',schedule);
    };
  },[token]);

  return null;
}
