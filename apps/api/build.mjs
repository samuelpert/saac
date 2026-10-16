// Bundles the API into dist/server.js. npm packages stay external and load from node_modules;
// the shared workspace package and the generated Prisma client are bundled in.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  plugins: [
    {
      name: 'externalize-npm',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('@saac/')) return undefined;
          return { path: args.path, external: true };
        });
      },
    },
  ],
});
