import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const workflow = fs.readFileSync('.github/workflows/dsi-chatgpt-review.yml', 'utf8');
assert.match(workflow, /pull_request_target:/);
assert.match(workflow, /pull_request:/);
assert.doesNotMatch(workflow, /OPENAI_API_KEY|api\.openai\.com|merge_pull_request|enable_auto_merge/i);
assert.match(workflow, /issues: write/);

const source = workflow.split('\n');
const start = source.findIndex(line => line.trim() === 'script: |');
assert.ok(start > 0, 'GitHub script must be present');
let codeLines = [];
for (const line of source.slice(start + 1)) {
  if (line.trim() && !line.startsWith('            ')) break;
  codeLines.push(line.startsWith('            ') ? line.slice(12) : '');
}
const compiled = new vm.Script('(async () => {\n' + codeLines.join('\n') + '\n})()');
const ghRepo = process.env.GITHUB_REPOSITORY || 'servaisgloire-commits/GIGI';
const [owner,repo] = ghRepo.split('/');
const expectedIssue = repo === 'GIGI' ? 73 : 9;
const sha = 'a'.repeat(40);
async function run(branch, fork=false, existing=false) {
  const calls = [];
  const pr = {
    number: 345, html_url: 'https://github.com/' + ghRepo + '/pull/345',
    head: {sha,ref:branch,repo:{full_name:fork ? 'other-user/other-repo' : ghRepo}}
  };
  const stub = {
    context:{repo:{owner,repo},payload:{pull_request:pr}},
    github:{
      paginate:async()=>existing ? [{body:'DSI-QUEUE-345-' + sha}] : [],
      rest:{issues:{listComments:()=>{},createComment:async args=>{calls.push(args);}}}
    }
  };
  await compiled.runInNewContext(stub,{timeout:1000});
  return calls;
}
const good = await run('dsi-safe-test');
assert.equal(good.length,1, 'one proposal per exact SHA');
assert.equal(good[0].issue_number,expectedIssue, 'right project correction queue');
assert.ok(good[0].body.includes(sha), 'commit must be included');
assert.equal((await run('dsi-safe-test',true)).length,0,'forks cannot trigger writing');
assert.equal((await run('feature-unrelated')).length,0,'non-DSI branches ignored');
assert.equal((await run('dsi-safe-test',false,true)).length,0,'duplicate proposals ignored');
console.log('PASS DSI free bridge: routing, SHA, fork filtering, deduplication, no paid API.');
