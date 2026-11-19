<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project pins Vite+ in `devDependencies`. Use its project-local CLI through the npm scripts in `package.json`; do not depend on a globally installed `vp`.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `npm ci` after pulling remote changes to install the lockfile-pinned project dependencies.
- [ ] Run `npm run check` and `npm test` to format, lint, type check and test changes.
- [ ] Run relevant `npm run` scripts from `package.json` for build and integration validation.
- [ ] If setup or package-manager behavior looks wrong, check local dependency versions with `npm ls vite-plus oxfmt`.

<!--VITE PLUS END-->
