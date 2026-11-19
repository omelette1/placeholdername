export const CHECKOV_VERSION='3.4.5';
// These IDs are checked against the pinned Checkov policy implementations.
export const POLICIES={
 CKV_AWS_24:{framework:'terraform',title:'Unrestricted SSH ingress',impact:'The configuration permits SSH from the public internet.'},
 CKV_AWS_25:{framework:'terraform',title:'Unrestricted RDP ingress',impact:'The configuration permits RDP from the public internet.'},
 CKV_AWS_20:{framework:'terraform',title:'Public S3 ACL',impact:'A configured S3 ACL may expose stored objects.'},
 CKV_AWS_1:{framework:'terraform',title:'Administrative IAM policy',impact:'The policy grants broad administrative permissions.'},
 CKV_K8S_16:{framework:'kubernetes',title:'Privileged container',impact:'A container requests privileged execution.'},
 CKV_K8S_17:{framework:'kubernetes',title:'Host process namespace',impact:'A workload requests the host process namespace.'},
 CKV_DOCKER_3:{framework:'dockerfile',title:'Container user not restricted',impact:'The Dockerfile does not establish a non-root user.'},
 CKV2_GHA_1:{framework:'github_actions',title:'Broad workflow permissions',impact:'Workflow-level token permissions are broader than the selected policy allows.'},
 CKV_GHA_1:{framework:'github_actions',title:'Unsafe workflow commands enabled',impact:'A workflow enables the deprecated unsafe-command environment setting.'},
 CKV_GHA_2:{framework:'github_actions',title:'Potential workflow shell injection',impact:'A shell step interpolates a potentially unsafe GitHub expression.'},
};
export function frameworkFor(file){if(/\.tf(?:\.json)?$/i.test(file))return 'terraform';if(/(^|\/)Dockerfile(?:\.[^/]+)?$|\.dockerfile$/i.test(file))return 'dockerfile';if(/(^|\/)\.github\/workflows\/[^/]+\.ya?ml$/i.test(file))return 'github_actions';if(/\.ya?ml$/i.test(file))return 'kubernetes';return null;}
