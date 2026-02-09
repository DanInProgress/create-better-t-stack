import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.pb.ts'],
  outDir: 'pb_hooks',
  format: ['cjs'],
  target: 'es5',
  noExternal: [/(.*)/],
  clean: true,
  minify: false,
  splitting: false,
});
