// Loaded by the trusted Python CLI before Checkov imports. This is defense in
// depth for a pinned trusted scanner, not a sandbox for arbitrary executables.
export const GUARD=String.raw`
import os, sys, json, atexit, socket, platform, shutil
socket.has_ipv6 = False
platform.processor = lambda: ""
root = os.path.realpath(os.environ['CHANGEPROOF_SCAN_ROOT'])
tool = os.path.realpath(os.environ['CHANGEPROOF_TOOL_ROOT'])
allowed = [root, tool, os.path.realpath(sys.base_prefix), '/usr/share/zoneinfo', '/etc/ssl/certs']
read_files = {'/dev/null', '/dev/urandom', '/etc/localtime', '/etc/mime.types'}
# Python platform.mac_ver reads this fixed OS metadata file on macOS.
# Allow only this canonical file, never the surrounding System directory.
if sys.platform == 'darwin':
    read_files.add(os.path.realpath('/System/Library/CoreServices/SystemVersion.plist'))
    # platform.architecture falls back to the running interpreter's pointer size
    # when no file output is available. Avoid spawning /usr/bin/file on macOS.
    platform._syscmd_file = lambda target, default='': default
counts = {'network': 0, 'subprocess': 0, 'outside_read': 0, 'outside_write': 0, 'metadata_probes': 0}
def contained(p, base):
    return p == base or p.startswith(base + os.sep)
def audit(event, args):
    if event in ('socket.connect', 'socket.connect_ex', 'socket.bind', 'socket.getaddrinfo', 'socket.gethostbyname'):
        counts['network'] += 1
        raise PermissionError('Changeproof scanner network access blocked')
    if event == 'subprocess.Popen':
        executable, command = args[0], args[1]
        if isinstance(executable, str) and isinstance(command, (list, tuple)) and len(command) == 2:
            name = os.path.basename(command[0])
            expected = ('git', 'version') if name == 'git' and command[1] in ('version', '--version') else ('uname', '-p') if name == 'uname' and command[1] == '-p' else None
            trusted = shutil.which(expected[0], path='/usr/bin:/bin') if expected else None
            resolved = shutil.which(executable, path='/usr/bin:/bin')
            if trusted and resolved and os.path.realpath(resolved) == os.path.realpath(trusted):
                counts['metadata_probes'] += 1
                return
    if event in ('subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn', 'os.fork', 'pty.spawn'):
        counts['subprocess'] += 1
        raise PermissionError('Changeproof scanner subprocess blocked')
    if event in ('os.remove', 'os.rmdir', 'os.mkdir', 'os.rename', 'os.link', 'os.symlink', 'os.chmod', 'os.truncate'):
        targets = args[:2] if event in ('os.rename', 'os.link', 'os.symlink') else args[:1]
        for target in targets:
            if isinstance(target, (str, bytes)) and not contained(os.path.realpath(os.fsdecode(target)), root):
                counts['outside_write'] += 1
                raise PermissionError('Changeproof scanner mutation blocked')
    if event == 'open' and isinstance(args[0], (str, bytes)):
        p = os.path.realpath(os.fsdecode(args[0]))
        flags = args[2] if len(args)>2 and isinstance(args[2], int) else 0
        writing = flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND)
        if writing and p != '/dev/null' and not contained(p, root):
            counts['outside_write'] += 1
            raise PermissionError('Changeproof scanner write blocked')
        if not writing and p not in read_files and not any(contained(p, base) for base in allowed):
            counts['outside_read'] += 1
            raise PermissionError('Changeproof scanner read blocked')
    if event in ('os.listdir', 'os.scandir') and args and isinstance(args[0], (str, bytes)):
        p = os.path.realpath(os.fsdecode(args[0]))
        if not any(contained(p, base) for base in allowed):
            counts['outside_read'] += 1
            raise PermissionError('Changeproof scanner traversal blocked')
sys.addaudithook(audit)
with open(os.path.join(root, 'guard.active'), 'w') as f:
    f.write('active')
@atexit.register
def finish():
    with open(os.path.join(root, 'guard-events.json'), 'w') as f:
        json.dump(counts, f)
`;
