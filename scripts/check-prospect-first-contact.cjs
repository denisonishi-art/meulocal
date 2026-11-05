const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');

// Load the actual TypeScript helper with no network or providers.
const source=fs.readFileSync(path.join(__dirname,'../lib/agents/first-contact-copy.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
assert.deepEqual(compiled.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')),[]);
const mod={exports:{}};
new Function('module','exports',compiled.outputText)(mod,mod.exports);
const {buildFirstContactDraft,isSafeFirstContactDraft,FIRST_CONTACT_INTRO}=mod.exports;

const selected=[
 ['Wizard by Pearson Cursino',4.0,5],
 ['Fisk Santo Amaro',4.0,12],
 ['Wise Up - Liberdade',4.0,11],
 ['Yázigi Mooca',4.5,10],
 ['Casa Britânica',4.5,14],
 ['Wise Up - Vila Mariana',4.4,25]
];

test('all six selected schools receive a differentiated, evidence-backed value proposition',()=>{
 for(const [name,rating,reviews] of selected){
  const draft=buildFirstContactDraft({name,niche:'escola de ingles',rating,reviews});
  assert.ok(isSafeFirstContactDraft(draft.message,draft),name);
  assert.ok(draft.message.length<=800,'First contact too long: '+name);
  assert.ok(draft.message.split('\\n\\n').length<=5,'Avoid repetitive paragraphs: '+name);
  assert.ok(draft.message.includes(FIRST_CONTACT_INTRO),name);
  assert.ok(draft.message.includes(name),name);
  assert.match(draft.message,/matr[ií]cula/i);
  assert.match(draft.message,/an[aá]lise gratuita/i);
  assert.match(draft.message,/Posso preparar e enviar/);
  assert.match(draft.message,/Se preferir n[aã]o receber contatos/i);
  assert.ok(draft.message.includes(rating.toFixed(1).replace('.',',')),name);
  assert.ok(draft.message.includes(String(reviews)+' avalia'),name);
  assert.doesNotMatch(draft.message,/como voc[eê]s organizam|quantas matr[ií]culas|reuni[aã]o/i);
  assert.doesNotMatch(draft.message,/https?:\/\/|www\./);
 }
});

test('unknown metrics remain absent, not silently treated as zero',()=>{
 const draft=buildFirstContactDraft({name:'Empresa Exemplo',niche:'clínica odontológica',rating:null,reviews:null});
 assert.ok(isSafeFirstContactDraft(draft.message,draft));
 assert.doesNotMatch(draft.message,/nota \d|\d+ avalia[cç]|sem avalia[cç][oõ]es/i);
 assert.match(draft.message,/pacientes/i);
 assert.match(draft.message,/agendamento/i);
});

test('restaurant messages focus on customers and reservations, not school enrollments',()=>{
 const draft=buildFirstContactDraft({name:'Restaurante Teste',niche:'restaurante',rating:4.8,reviews:89});
 assert.match(draft.message,/reservas/i);
 assert.doesNotMatch(draft.message,/matr[ií]cula|pacientes/i);
 assert.ok(isSafeFirstContactDraft(draft.message,draft));
});

test('model cannot suppress evidence, intro, permission, opt-out, or introduce fabricated numbers',()=>{
 const draft=buildFirstContactDraft({name:'Escola Exemplo',niche:'escola de inglês',rating:4.0,reviews:12});
 assert.ok(isSafeFirstContactDraft(draft.message,draft));
 assert.equal(isSafeFirstContactDraft(draft.message.replace('12 avaliações','200 avaliações'),draft),false);
 assert.equal(isSafeFirstContactDraft(draft.message.replace('Sou Denis, fundador do MeuLocal','Olá, meu nome é Denis'),draft),false);
 assert.equal(isSafeFirstContactDraft(draft.message.replace('Posso preparar e enviar','Gostaria de saber se posso enviar'),draft),false);
 assert.equal(isSafeFirstContactDraft(draft.message+' Garantimos 40% mais matrículas.',draft),false);
 assert.equal(isSafeFirstContactDraft(draft.message+' Aumentará as vendas.',draft),false);
 assert.equal(isSafeFirstContactDraft(draft.message+' https://fake.example',draft),false);
});
