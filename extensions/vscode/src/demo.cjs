const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const execute = promisify(execFile);
const BASELINE = '// Synthetic demo: Patch never executes this file.\nfunction reviewRequest(req) {\n  const raw = "public diagnostic value";\n  const payload = raw;\n  console.log(payload);\n}\n';
const CHANGED = BASELINE.replace('"public diagnostic value"', 'req.headers.authorization');

function canonicalCandidate(candidate) {
  let parent = path.resolve(candidate);
  const suffix = [];
  while (!fs.existsSync(parent)) {
    suffix.unshift(path.basename(parent));
    const next = path.dirname(parent);
    if (next === parent) throw new Error('Cannot resolve demo storage.');
    parent = next;
  }
  return path.join(fs.realpathSync(parent), ...suffix);
}
function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
async function createDemo(storageDirectory, protectedFolders = [], progress = () => {}) {
  const storage = canonicalCandidate(storageDirectory);
  // Check before creating anything; never initialize a repository in an actual workspace.
  for (const folder of protectedFolders) {
    if (inside(canonicalCandidate(folder), storage)) throw new Error('Demo storage is inside the current workspace; refusing to modify that project.');
  }
  fs.mkdirSync(storage, {recursive: true});
  const directory = fs.mkdtempSync(path.join(storage, 'authorization-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
  Object.assign(env, {GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_OPTIONAL_LOCKS: '0'});
  const git = args => execute('git', ['--no-optional-locks', '-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=' + os.devNull,
    '-c', 'commit.gpgSign=false', '-c', 'user.name=Patch Synthetic Demo', '-c', 'user.email=demo@example.invalid', '-C', directory, ...args],
  {env, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true});
  try {
    progress('Creating a synthetic repository in dedicated demo storage');
    await git(['init', '--quiet', '--template=', '--initial-branch=demo']);
    fs.writeFileSync(path.join(directory, 'app.ts'), BASELINE, {flag: 'wx'});
    progress('Committing the synthetic baseline only');
    await git(['add', '--', 'app.ts']);
    await git(['commit', '--quiet', '-m', 'Synthetic safe baseline']);
    fs.writeFileSync(path.join(directory, 'app.ts'), CHANGED);
    return directory;
  } catch {
    // This was a freshly allocated directory, never a user's existing repository.
    fs.rmSync(directory, {recursive: true, force: true});
    throw new Error('Could not create the synthetic demo baseline. Check that trusted Git is available. No workspace repository was modified.');
  }
}
function demoEvidence(directory, finding) {
  const lines = ['CHANGEPROOF — SYNTHETIC DEMO', '', 'Reviewed folder: ' + directory, '', finding.rule_id + ': ' + finding.title,
    'Potential exposure; not a confirmed runtime leak.', '', 'SOURCE → ASSIGNMENT → LOGGING'];
  for (const flow of finding.evidence.paths) {
    const at = loc => loc.file + ':' + loc.start.line;
    lines.push('Source: ' + at(flow.source.location) + ' — authorization-header read');
    for (const step of flow.assignments) lines.push('  → ' + step.kind + ' ' + step.variable + ' at ' + at(step.location));
    lines.push('  → console.' + flow.logging.console_method + ' at ' + at(flow.logging.location));
    lines.push('New relative to HEAD: ' + (flow.newly_introduced === null ? 'unknown' : flow.newly_introduced), '');
  }
  lines.push('Runtime verification: false', '', 'LIMITATIONS', ...finding.limitations.map(text => '• ' + text));
  return lines.join('\n');
}
module.exports = {createDemo, demoEvidence};
