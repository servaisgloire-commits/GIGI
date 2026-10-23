"use strict";
const crypto = require("node:crypto");
// FAST: authenticated chat -> bounded GitHub branch and PR executor.
// No delete, no direct main commit, no merge, no deployment and no model access to GitHub tokens.
const REPO="servaisgloire-commits/GIGI";
const MANIFEST=".github/agents/fast-per-agent-workflows.json";
const TOKEN_HASH="15a771603d2d2fe18605c974b28d5a7ba2cbc2e418a07f18350b930a6c77a1e1";
const ROOTS=["app/","backend/","admin/","tests/"];
const GITHUB="https://api.github.com/repos/"+REPO;
const RESTRICTED=/\\/(?:\\.env|node_modules|secret|secrets|private[-_]?key|credentials|\.git)(?:\\/|\\.|$)/i;
const DESTRUCTIVE=/\\b(?:DROP\\s+TABLE|TRUNCATE\\s+TABLE|DELETE\\s+FROM|rm\\s+-rf|git\\s+rm|REVOKE\\s+ALL|DROP\\s+POLICY)\\b/i;
function send(res,status,data){return res.status(status).json(data)}
function equalToken(value){
 const hash=crypto.createHash("sha256").update(String(value||""),"utf8").digest("hex");
 return crypto.timingSafeEqual(Buffer.from(hash),Buffer.from(TOKEN_HASH));
}
function validPath(path){
 return typeof path==="string" && path.length<=220 && ROOTS.some(r=>path.startsWith(r)) &&
 /^[A-Za-z0-9_.\\/-]+\\.(?:js|jsx|ts|tsx|mjs|css|html|kt|java|py|xml|json)$/.test(path) &&
 !path.includes("..") && !RESTRICTED.test("/"+path) &&
 !/(?:^|\\/)(?:auth|security|secrets?|credentials|migrations|node_modules)(?:\\/|\\.|$)/i.test(path);
}
async function gh(token,method,path,body){
 const response=await fetch(GITHUB+path,{method,headers:{
  Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json",
  "User-Agent":"fast-agent-safe-code-fix"
 },body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(16000)});
 const obj=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error("GITHUB_HTTP_"+response.status);
 return obj;
}
module.exports=async function codeFix(req,res){
 if(req.method!=="POST")return send(res,405,{ok:false,error:"METHOD_NOT_ALLOWED"});
 if(!equalToken(req.headers["x-brain-token"]))return send(res,401,{ok:false,error:"UNAUTHORIZED"});
 const b=req.body&&typeof req.body==="object"?req.body:{};
 const agent=String(b.agent_id||"").trim(),path=String(b.source_path||"");
 const expected=String(b.base_sha||""),find=b.find,replace=b.replace;
 const evidence=String(b.bug_evidence||"").trim();
 if(!/^(?:dsi|metier):[\\p{L}A-Za-z0-9_-]{2,75}$/u.test(agent)||!validPath(path)||
  !/^[a-f0-9]{40}$/.test(expected)||typeof find!=="string"||typeof replace!=="string"||
  find.length<4||find.length>1700||replace.length<4||replace.length>3500||
  evidence.length<16||evidence.length>1200||find===replace||
  DESTRUCTIVE.test(replace)||/sb_secret_|sk-proj-|github_pat_|ghp_[A-Za-z0-9]{12}/i.test(replace))
  return send(res,400,{ok:false,error:"INVALID_OR_UNSAFE_CHANGE"});
 const token=process.env.GITHUB_AGENT_REPO_TOKEN;
 if(!token)return send(res,503,{ok:false,error:"SCOPED_GITHUB_TOKEN_NOT_CONNECTED"});
 try{
  const main=await gh(token,"GET","/branches/main");
  if(main.commit?.sha!==expected)return send(res,409,{ok:false,error:"BASE_SHA_CHANGED",current_sha:main.commit?.sha});
  const mf=await gh(token,"GET","/contents/"+MANIFEST.split("/").map(encodeURIComponent).join("/")+"?ref=main");
  const raw=Buffer.from(mf.content||"","base64").toString("utf8");
  const manifest=JSON.parse(raw);
  const profile=manifest.workflows?.find(a=>a.id===agent);
  if(manifest.organization!=="FAST"||!profile||profile.mode!=="mediated_corrective_work"||
    profile.github!==REPO||!profile.limits?.no_deletion||!profile.limits?.no_cross_org ||
    !profile.source_scopes?.some(root=>path.startsWith(root+"/")))
   return send(res,403,{ok:false,error:"AGENT_SCOPE_NOT_AUTHORIZED"});
  const content=await gh(token,"GET","/contents/"+path.split("/").map(encodeURIComponent).join("/")+"?ref=main");
  if(content.type!=="file"||content.size>80000||!content.sha)
   return send(res,403,{ok:false,error:"SOURCE_NOT_ALLOWED"});
  const before=Buffer.from(content.content||"","base64").toString("utf8");
  const index=before.indexOf(find);
  if(index<0||before.indexOf(find,index+find.length)>=0)return send(res,409,{ok:false,error:"PATCH_CONTEXT_NOT_UNIQUE"});
  const after=before.slice(0,index)+replace+before.slice(index+find.length);
  if(after.length>85000||after.length<before.length-500)return send(res,400,{ok:false,error:"PATCH_TOO_DESTRUCTIVE"});
  if(/(?:private_key|GITHUB_AGENT_REPO_TOKEN|SUPABASE_SERVICE_ROLE_KEY)/i.test(replace))
   return send(res,403,{ok:false,error:"CREDENTIAL_REFERENCE_DENIED"});
  if(b.dry_run===true)return send(res,200,{ok:true,validated:true,agent,repo:REPO,base_sha:expected,
    path,git_modified:false,production_modified:false});
  const branch="agent-fix/"+Date.now().toString(36)+"-"+crypto.randomBytes(4).toString("hex");
  await gh(token,"POST","/git/refs",{ref:"refs/heads/"+branch,sha:expected});
  const updated=await gh(token,"PUT","/contents/"+path.split("/").map(encodeURIComponent).join("/"),{
   message:"fix: non-destructive agent correction for "+agent,
   content:Buffer.from(after).toString("base64"),sha:content.sha,branch
  });
  const pr=await gh(token,"POST","/pulls",{title:"fix: verified correction proposed by "+agent,
   head:branch,base:"main",draft:true,
   body:"Automated guarded correction request.\\nOrganization: FAST\\nAgent: "+agent+
    "\\nBase SHA: "+expected+"\\nFile: "+path+"\\nEvidence: "+evidence+
    "\\nNo production deployment performed. CI and review required before merge."});
  return send(res,201,{ok:true,organization:"FAST",agent,
   branch,commit_sha:updated.commit?.sha||null,pr_url:pr.html_url,
   status:"PR_DRAFT_AWAITING_TESTS",production_deployed:false,delete_allowed:false});
 }catch(e){
  return send(res,502,{ok:false,error:String(e.message||e).slice(0,140),no_deployment:true});
 }
};