import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const [manifestPath, organization, expectedCountText, selected = 'all', capabilityPath = '.github/agent-platform-capabilities.json'] = process.argv.slice(2);
const fail = (message) => { throw new Error(message); };
const expected = Number(expectedCountText);
if (!manifestPath || !organization || !Number.isInteger(expected)) fail('Missing or invalid CLI args');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const grants = JSON.parse(fs.readFileSync(capabilityPath, 'utf8'));
if (manifest.organization !== organization || grants.organization !== organization) fail('Cross-organization manifest mismatch');
if (manifest.expected_agents !== expected || manifest.workflows?.length !== expected) fail('Agent total mismatch');
if (grants.agents?.length !== expected) fail('Capability count mismatch');
const project = organization === 'FAST'
  ? {repo:'servaisgloire-commits/GIGI', db:'hmwxwzfcpdvgzjgxruup'}
  : {repo:'servaisgloire-commits/GIGI-Talon-Congo', db:'ioffjwxfxrqvxttbjeok'};
if (manifest.repo !== project.repo) fail('Wrong GitHub repository');
const ids = new Set();
const caps = new Set(grants.agents.map(x => x.agent_id || x.id));
const requiredSteps = ['chat', 'github', 'supabase', 'tests', 'review', 'execution', 'vercel', 'chat'];
const blocked = /(^|[.:_-])(delete|drop|truncate|purge|destroy|remove|erase|revoke)([.:_-]|$)/i;
const errors = [];
const rows = [];
for (const a of manifest.workflows) {
  const f = (err) => errors.push(a.id+': '+err);
  if (!a.id || ids.has(a.id)) { f('Duplicate or missing identity'); continue; }
  ids.add(a.id);
  if (!caps.has(a.id)) f('Missing exact capability mapping');
  if (!['dsi', 'metier'].includes(a.group) || !a.id.startsWith(a.group+':')) f('Invalid agent group');
  if (!a.name || !a.mission || !a.department) f('Mission or department missing');
  if (a.model !== 'gpt-6-sol') f('Model mismatch');
  if (a.github !== project.repo || a.supabase_project !== project.db) f('Cross-project reference');
  if (!a.limits?.no_deletion || !a.limits?.no_cross_org || !a.limits?.no_secret_access || !a.limits?.no_direct_admin_credentials) f('Mandatory security guard missing');
  if (!['audit_only', 'mediated_corrective_work'].includes(a.mode)) f('Invalid workflow execution mode');
  if (!Array.isArray(a.source_scopes) || a.source_scopes.length===0) f('No source scopes');
  for (const root of a.source_scopes || []) {
    if (root.includes('..') || root.startsWith('/') || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) f('Missing/unsafe source scope '+root);
  }
  const steps = a.workflow || [];
  if (steps.length!==requiredSteps.length || steps.some((s,i)=>s.step!==requiredSteps[i])) f('Workflow stage order mismatch');
  if (steps.some(s=>!s.operation || !s.require || blocked.test(s.operation))) f('Unsafe/incomplete workflow operation');
  if (a.mode==='audit_only' && steps[5]?.operation !== 'report_findings_without_code_write') f('Audit agent must not request code write');
  if (a.mode==='mediated_corrective_work' && steps[5]?.operation !== 'request_mediated_safe_patch_in_separate_PR') f('Code changes must be delegated to reviewed PR');
  rows.push({id:a.id,mode:a.mode,scopes:a.source_scopes.join(', ')});
}
if (ids.size!==caps.size || [...caps].some(id=>!ids.has(id))) fail('Capabilities and per-agent workflows do not match exactly');
if (rows.filter(x=>x.id.startsWith('dsi:')).length!==18) fail('Expected 18 DSI agents');
if (selected!=='all' && !ids.has(selected)) fail('Requested agent is not registered in this organization: '+selected);
if (errors.length) fail(errors.slice(0,20).join('\n')+(errors.length>20?'\n...other failures':''));
const subset=selected==='all'?rows:rows.filter(x=>x.id===selected);
console.log('Project:',organization,'Total validated:',rows.length,'Requested:',selected);
for (const a of subset) console.log('VALIDATED',a.id,a.mode, a.scopes);
const summary = [
  '## '+organization+' — Agent-specific workflow validation',
  '',
  '| Result | Value |',
  '|---|---|',
  '| Definitions checked | '+rows.length+' |',
  '| DSI agents | 18 |',
  '| Business agents | '+(rows.length-18)+' |',
  '| Distinct scoped identities | '+ids.size+' |',
  '| Execution | GitHub Actions read-only, with maintenance-mediated writes only |',
  '| Model | gpt-6-sol |',
  '| Scope | '+selected+' |',
  '',
  ...subset.map(a=>'- **'+a.id+'**: '+a.mode+' · '+a.scopes)
].join('\n')+'\n';
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary);
