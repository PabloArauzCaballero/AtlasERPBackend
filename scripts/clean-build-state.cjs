const { rmSync } = require('fs');

const buildArtifacts = [
  'dist',
  'tsconfig.tsbuildinfo',
  'tsconfig.build.tsbuildinfo',
  'tsconfig.scripts.tsbuildinfo',
];

for (const artifactPath of buildArtifacts) {
  rmSync(artifactPath, { recursive: true, force: true });
}
