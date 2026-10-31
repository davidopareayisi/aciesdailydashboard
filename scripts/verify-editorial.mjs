import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
const base='http://127.0.0.1:3104';
assert.equal((await(await fetch(`${base}/api/auth/session`)).json()).testMode,true,'Synthetic preview only');
const accounts=JSON.parse(await readFile('.data/editorial-qa/accounts.json','utf8')),cookies={};
async function request(role,route,method='GET',data) { const r=await fetch(`${base}/api/${route}`,{method,headers:{origin:base,'content-type':'application/json',...(cookies[role]?{cookie:cookies[role]}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,data:await r.json(),headers:r.headers}; }
for(const [role,a] of Object.entries(accounts)){const r=await request(role,'auth/login','POST',{phone:a.phone,password:a.password});assert.equal(r.status,200);cookies[role]=r.headers.get('set-cookie').split(';')[0];}
for(const role of ['writer','editor']){assert.equal((await request(role,'staff/enquiries')).status,403);assert.equal((await request(role,'staff/accounts')).status,403);assert.equal((await request(role,'staff/invite-account','POST',{role:'staff',name:'Test',phone:'+12025550101'})).status,403);}
assert.equal((await request('staff','editorial')).status,403);assert.equal((await request('client','editorial')).status,403);assert.equal((await request('anonymous','editorial')).status,401);
console.log('PASS editorial roles cannot read client projects, invite staff or reach owner settings');
let r=await request('writer','editorial','POST',{action:'create'});assert.equal(r.status,201);let story=r.data.article;
const fields={title:'A real review boundary',summary:'A synthetic story used only in isolated QA.',body:'A carefully written synthetic story for testing. '.repeat(6),category:'Business',author:'QA Writer',imageId:'',imageAlt:'',imageCredit:'',sponsor:'QA Sponsor',sponsorUrl:'https://example.com',correction:''};
const form = new FormData(); form.set('file',new File([await sharp({create:{width:16,height:16,channels:3,background:'#d7bca2'}}).png().toBuffer()],'qa.png',{type:'image/png'}));
const uploaded = await fetch(`${base}/api/upload`,{method:'POST',headers:{origin:base,cookie:cookies.writer},body:form});assert.equal(uploaded.status,201);const image=(await uploaded.json()).media;
fields.imageId=image.id;fields.imageAlt='Synthetic QA image';fields.imageCredit='AciesDaily QA';
assert.equal((await fetch(`${base}/api/media/${image.id}`)).status,404);
async function change(role,action,extra={}){const r=await request(role,`editorial/${story.id}`,'PATCH',{revision:story.revision,action,...extra});if(r.status===200)story=r.data.article;return r;}
assert.equal((await change('writer','save',fields)).status,200);
assert.equal((await request('other','editorial')).data.articles.some(a=>a.id===story.id),false);
assert.equal((await change('other','save',fields)).status,403);
assert.equal((await change('writer','publish')).status,403);
assert.equal((await request('anonymous','publication/articles')).data.articles.some(a=>a.id===story.id),false);
assert.equal((await change('writer','submit')).status,200);
assert.equal((await change('editor','publish')).status,200);
const first=story.published;assert.equal(first.sponsor,'QA Sponsor');
assert.equal((await fetch(`${base}/api/media/${image.id}`)).status,200);
let publicStory=(await request('anonymous','publication/articles')).data.articles.find(a=>a.id===story.id);assert.equal(publicStory.title,fields.title);assert.equal('userId' in publicStory,false);assert.equal('revision' in publicStory,false);
assert.equal((await change('writer','save',{...fields,title:'Private revision that must not leak'})).status,200);
publicStory=(await request('anonymous','publication/articles')).data.articles.find(a=>a.id===story.id);assert.equal(publicStory.title,fields.title);
assert.equal((await request('writer',`editorial/${story.id}`,'PATCH',{...fields,action:'save',revision:1})).status,409);
assert.equal((await change('editor','publish')).status,200);assert.equal(story.slug,first.slug);
console.log('PASS drafts, review, editor publication, public projection, revision conflict and stable article URL');
assert.equal((await change('editor','unpublish')).status,200);assert.equal((await request('anonymous','publication/articles')).data.articles.some(a=>a.id===story.id),false);
assert.equal((await fetch(`${base}/api/media/${image.id}`)).status,404);
assert.equal((await change('editor','publish',{publishAt:new Date(Date.now()+3600000).toISOString()})).status,200);assert.equal(story.status,'Scheduled');assert.equal((await request('anonymous','publication/articles')).data.articles.some(a=>a.id===story.id),false);
assert.equal((await change('editor','unpublish')).status,200);
assert.equal((await change('editor','publish')).status,200);
const cross=await fetch(`${base}/api/editorial/${story.id}`,{method:'PATCH',headers:{origin:'https://example.org','content-type':'application/json',cookie:cookies.writer},body:JSON.stringify({...fields,action:'save',revision:story.revision})});assert.equal(cross.status,403);
console.log('PASS unpublish, scheduling and cross-origin mutation protection');
console.log('PASS article image stays private until publication and is withdrawn with the article');
await writeFile('.data/editorial-qa/public-story.json',JSON.stringify({slug:story.slug,id:story.id}),{mode:0o600});
// No production provider is contacted; these records live only in the QA directory.
