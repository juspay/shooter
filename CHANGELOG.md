## [1.9.3](https://github.com/juspay/shooter/compare/v1.9.2...v1.9.3) (2026-05-15)

### Bug Fixes

* **(deps):**  re-bump svelte and add pnpm.overrides for remaining CVEs ([2c98b34](https://github.com/juspay/shooter/commit/2c98b34f6be60b12f046b6ac6a63321a9fd4215b)), closes [#91](https://github.com/juspay/shooter/issues/91) [#92](https://github.com/juspay/shooter/issues/92) [#89](https://github.com/juspay/shooter/issues/89) [#90](https://github.com/juspay/shooter/issues/90) [#103](https://github.com/juspay/shooter/issues/103) [#107](https://github.com/juspay/shooter/issues/107) [#105](https://github.com/juspay/shooter/issues/105) [#39](https://github.com/juspay/shooter/issues/39) [#77](https://github.com/juspay/shooter/issues/77) [#66](https://github.com/juspay/shooter/issues/66) [#67](https://github.com/juspay/shooter/issues/67)

## [1.9.2](https://github.com/juspay/shooter/compare/v1.9.1...v1.9.2) (2026-05-15)

### Bug Fixes

* **(deps):**  dedupe lockfile and consolidate security bumps ([de1b2a4](https://github.com/juspay/shooter/commit/de1b2a45485a039705693c41057f24482c77a1f6)), closes [#61](https://github.com/juspay/shooter/issues/61) [#52](https://github.com/juspay/shooter/issues/52) [#50](https://github.com/juspay/shooter/issues/50) [#61](https://github.com/juspay/shooter/issues/61) [#99](https://github.com/juspay/shooter/issues/99) [#63](https://github.com/juspay/shooter/issues/63) [#64](https://github.com/juspay/shooter/issues/64)

## [1.9.1](https://github.com/juspay/shooter/compare/v1.9.0...v1.9.1) (2026-05-09)

### Bug Fixes

* **(apn):**  replace @parse/node-apn with curl HTTP/2 transport ([3187014](https://github.com/juspay/shooter/commit/3187014b7f9db9d49bbe2f02ba95ef441c72928f))

## [1.9.0](https://github.com/juspay/shooter/compare/v1.8.0...v1.9.0) (2026-05-08)

### Features

* **(notifications):**  enrich pushes with session context, drop noise ([845f344](https://github.com/juspay/shooter/commit/845f34492fb0684504e44e246a148db2a3e825f6))

## [1.8.0](https://github.com/juspay/shooter/compare/v1.7.1...v1.8.0) (2026-04-29)

### Features

*  add git-based auto-update mechanism and fix session viewer ([b431c9e](https://github.com/juspay/shooter/commit/b431c9e482543e295433df8d86c8889b2e15cc08))

## [1.7.1](https://github.com/juspay/shooter/compare/v1.7.0...v1.7.1) (2026-04-25)

### Bug Fixes

*  replace invalid :global() in global CSS and tidy stylelint nits ([e0c8dac](https://github.com/juspay/shooter/commit/e0c8dac897766b0aa27ca66f48b00535a642bab9))

## [1.7.0](https://github.com/juspay/shooter/compare/v1.6.2...v1.7.0) (2026-04-21)

### Features

*  maximize svelte-ui-components library usage, consolidate CSS ([7b2c767](https://github.com/juspay/shooter/commit/7b2c767fb542554277164be35c4f83840d412dca)), closes [#4ade80](https://github.com/juspay/shooter/issues/4ade80) [#22c55e](https://github.com/juspay/shooter/issues/22c55e)

## [1.6.2](https://github.com/juspay/shooter/compare/v1.6.1...v1.6.2) (2026-04-17)

### Bug Fixes

*  session discovery fallback, dashboard UI, and message dedup ([4a1e559](https://github.com/juspay/shooter/commit/4a1e559e63dea20171d2cbba3ba9185a2779c183))

## [1.6.1](https://github.com/juspay/shooter/compare/v1.6.0...v1.6.1) (2026-04-17)

### Bug Fixes

*  decode hyphenated project paths, wire FCM end-to-end, and harden android ([9e61ab9](https://github.com/juspay/shooter/commit/9e61ab92439c7189850c1e850e398ad71b44df71))

## [1.6.0](https://github.com/juspay/shooter/compare/v1.5.0...v1.6.0) (2026-04-15)

### Features

*  NeuroLink AI integration, live dashboard, activity feed, and type governance ([5373a44](https://github.com/juspay/shooter/commit/5373a441dc8c399d965a844a3b39834a7dad1d5d))

## [1.5.0](https://github.com/juspay/shooter/compare/v1.4.0...v1.5.0) (2026-04-03)

### Features

- simplify setup, fix Docker boot, harden installer ([b9c970d](https://github.com/juspay/shooter/commit/b9c970d669c148fc33d356431bdd15330651c1d0))

## [1.4.0](https://github.com/juspay/shooter/compare/v1.3.0...v1.4.0) (2026-04-02)

### Features

- **(ci):** add smoke-test job that starts server and tests endpoints ([3692545](https://github.com/juspay/shooter/commit/369254553c75ceefd151c05f37417fec34f26217))

## [1.3.0](https://github.com/juspay/shooter/compare/v1.2.0...v1.3.0) (2026-04-02)

### Features

- **(cli):** add daemon mode, auto-tunnel, and tunnel lifecycle management ([62d8193](https://github.com/juspay/shooter/commit/62d819342b79fcea7ce6b2193104abdf3cbbb350))

### Bug Fixes

- enable precompress to prevent .gz ENOENT crash ([a888420](https://github.com/juspay/shooter/commit/a888420ad85bcac814064e1d59de8797c0868e20))
- **(ci):** remove npm self-upgrade that breaks release build ([a0b0c79](https://github.com/juspay/shooter/commit/a0b0c791978e1acf679e7443a588eb02340d29b1))

## [1.2.0](https://github.com/juspay/shooter/compare/v1.1.0...v1.2.0) (2026-04-01)

### Features

- add session connect/resume, ChatView tool grouping, and UX polish ([b01137b](https://github.com/juspay/shooter/commit/b01137b45a56e9125f88f4d018ea79d27cf5327b))

## [1.1.0](https://github.com/juspay/shooter/compare/v1.0.0...v1.1.0) (2026-03-28)

### Features

- overhaul fresh-user experience — one-command install, full CLI lifecycle ([570de58](https://github.com/juspay/shooter/commit/570de58e209e2a26f08e63b3b8b3f1dff4445c80))

## 1.0.0 (2026-03-27)

### ⚠ BREAKING CHANGES

- Hook scripts now require environment variables to be set

Security Fixes:

- Remove hardcoded API keys and device tokens from all hook scripts
- Add validation to ensure SHOOTER_API_KEY and SHOOTER_DEVICE_TOKEN are set
- Remove unused hook files that contained exposed tokens
- Update universal_notifier URL to latest deployment

Required Environment Variables:

- SHOOTER_API_KEY: API authentication token
- SHOOTER_DEVICE_TOKEN: APNs device token for notifications

Scripts will now exit with error if environment variables are missing,
preventing accidental use of hardcoded fallback tokens.

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>

- - Moved all SvelteKit files from sveltekit-app/ to root directory

* Updated to use @sveltejs/adapter-auto instead of adapter-vercel for flexibility
* Created comprehensive .gitignore following best practices
* Structure now matches industry standard SvelteKit projects

NEW STRUCTURE:

- src/ - All source code in root
- package.json, svelte.config.js, vite.config.js in root
- Proper gitignore excludes node_modules, .svelte-kit, etc.
- Compatible with multiple deployment targets via adapter-auto

FIXED:

- No more nested sveltekit-app directory
- Proper dependency management with Bun
- Clean git history without tracked build artifacts

### security

- remove hardcoded tokens and add environment variable validation ([8fd1f3a](https://github.com/juspay/shooter/commit/8fd1f3afccbbcb6cccac9c805d986500cb2762d9))

### RESTRUCTURE

- Move SvelteKit to root directory (following neurolink pattern) ([fc77860](https://github.com/juspay/shooter/commit/fc7786022ff092fc85e8fd25c927d1d56149c490))

### Features

- add bidirectional permission flow with iOS interactive notifications ([31f67c7](https://github.com/juspay/shooter/commit/31f67c7e0a1440be7b4f226c9096e70f80cf8dde))
- add comprehensive Vercel environment variable debugging strategy and tools ([1573fe8](https://github.com/juspay/shooter/commit/1573fe8cd528001c955b31b9df79a2aaeb8d618e))
- add dark theme optimized SHOOTER app icon with AI targeting design ([e96d34d](https://github.com/juspay/shooter/commit/e96d34d76282c26f05ec59c1f11afbc123a1b08b))
- add environment variable debugging endpoint for production troubleshooting ([d657b72](https://github.com/juspay/shooter/commit/d657b721fa7846066a0acdc8c5dce9560a4696b8))
- add mobile terminal access via WebSocket streaming ([8c8b03b](https://github.com/juspay/shooter/commit/8c8b03ba26ace73a8b783f25edbb709bc5f5f5f1))
- implement Claude Code lifecycle hooks integration for real-time iOS push notifications ([178a697](https://github.com/juspay/shooter/commit/178a6978e4eebb46c2100f835dcfbf57b120e2b6))
- implement per-instance activity filtering for smart completion detection ([4fbc929](https://github.com/juspay/shooter/commit/4fbc929367a352dbcdf5b4fa559858840c63c56d))
- implement server-side intelligent notification filtering ([639b9e4](https://github.com/juspay/shooter/commit/639b9e499dd5a3242c39a98fec6418bd1033c7a6))
- implement server-side notification deduplication ([109640b](https://github.com/juspay/shooter/commit/109640b1f010c08443914ca55451ca496f472fca))
- implement universal Claude Code hooks notification system ([949b17a](https://github.com/juspay/shooter/commit/949b17aaaf888c0da93f0046b294d338ded322db))
- migrate UI to @juspay/svelte-ui-components ([dc719e7](https://github.com/juspay/shooter/commit/dc719e7c38c11c50ff64b65fa3acc5e0798215f4))
- redesign iOS app as notification-focused system with modern SwiftUI ([0cadecf](https://github.com/juspay/shooter/commit/0cadecf4a6a9bac21657b517618f556d4be20dd5))
- redesign UI as notification-focused system with separate config page ([7bfa315](https://github.com/juspay/shooter/commit/7bfa315203010d6ee411e8352a85737dd285a1f8))
- terminal persistence, pattern analysis fixes, setup simplification, QR scanner ([e25302e](https://github.com/juspay/shooter/commit/e25302e41e20f792ca4facd75c40ef2335ad6695))
- trigger redeployment for updated device token ([749bcc9](https://github.com/juspay/shooter/commit/749bcc961455943da52ede3e6eb8cf316c4889d9))
- universal installer and full lifecycle CLI ([aff3b72](https://github.com/juspay/shooter/commit/aff3b728ed92e352a4e77e387cb6b80cf063ced6))
- **(types):** complete type-crafter migration — zero inline types, zero type errors ([45b89b3](https://github.com/juspay/shooter/commit/45b89b3afd5b8d05fc4dbe8e513aada31ee0470f))
- **(ui):** migrate to svelte-ui-components, add CI/CD pipeline ([e69d2b4](https://github.com/juspay/shooter/commit/e69d2b497d355332b397caa7559316dc8adb5b3a))

### Bug Fixes

- add Vercel production environment setup guide with placeholder values ([ae56a0d](https://github.com/juspay/shooter/commit/ae56a0d7ff3a5013a45c7c015ac38c283c6fef11))
- address PR review comments ([01e88c6](https://github.com/juspay/shooter/commit/01e88c6cd83b8e015529056aca2488d43251f40d))
- allow Stop hook completion notifications through spam filter ([57527f9](https://github.com/juspay/shooter/commit/57527f9094fcce2570a228efa2192c553fe129f1))
- comprehensive security, build, and cleanup fixes ([6dcbe83](https://github.com/juspay/shooter/commit/6dcbe8373c8e8a645ea16e9ebed015fb09cd0467))
- config save, project path decode, and shift+enter newline support ([6a7630f](https://github.com/juspay/shooter/commit/6a7630ffeb70805d176186dc87b521193cbbb6bb))
- deploy sandbox APNs mode for development iOS app ([d865d90](https://github.com/juspay/shooter/commit/d865d900c6a16f85dd86a2260b4efcdd71e1c604))
- enhance Claude Code hooks with proper tool name detection ([979273c](https://github.com/juspay/shooter/commit/979273cce41bdb5961b3353820a489fec8940e1b))
- force deployment with version bump to test deduplication ([f119066](https://github.com/juspay/shooter/commit/f119066b6099a6cf28fed97446d2f7980218ff6e))
- improve notification filtering patterns and add detailed logging ([2be85bf](https://github.com/juspay/shooter/commit/2be85bf92fe4ac2f3fca87cdfb85145cf65aa427))
- increase connection timeout for Node.js 18+ Happy Eyeballs algorithm ([e83d0ed](https://github.com/juspay/shooter/commit/e83d0ed42714d91d2fab8a200c7a98e16f1911e2))
- resolve ESLint errors in bidirectional flow files ([1c43c6d](https://github.com/juspay/shooter/commit/1c43c6d0d581e0cd51d131e5d99f78c946217060))
- update hook scripts to use latest deployment URL with enhanced logging ([ab17a5a](https://github.com/juspay/shooter/commit/ab17a5ad1dbe9984cb8ccda08aaa2cd07ca959c1))
- update notification filtering to allow shooter-completion-detector source ([8bb8605](https://github.com/juspay/shooter/commit/8bb860517b6aff8bb1e86c97541f1e37dbe15a41))
- **(ci):** add npm provenance for OIDC-based publishing ([67f3bd2](https://github.com/juspay/shooter/commit/67f3bd2bc3c047caaf78842138b1f9aca4ffbc69))
- **(ci):** add semantic-release plugins to devDependencies ([61c8fc6](https://github.com/juspay/shooter/commit/61c8fc63deaa379f38b1c69fcccdbe1b7ada1969))
- **(ci):** pin npx semantic-release@25 to ensure OIDC verifyConditions support ([190a4cf](https://github.com/juspay/shooter/commit/190a4cf22c8663cedfde456494754cd9a6dc13bc))
- **(ci):** upgrade to Node 22 and @semantic-release/npm v13 for OIDC provenance ([fea226e](https://github.com/juspay/shooter/commit/fea226ef56789dd9d022fcec11033e33d70e24e4))
- **(ci):** use GITHUB_TOKEN + OIDC for npm publish, drop NPM_TOKEN requirement ([dd2d1d8](https://github.com/juspay/shooter/commit/dd2d1d8733b58eb9993a347215f5fb36a3c2d2d8))
- **(ci):** use npx semantic-release to get v25 with OIDC verifyConditions support ([b1581a2](https://github.com/juspay/shooter/commit/b1581a2178c82bd4eb8e8b98efa81578a4868fda))
- **(ui):** fix lint errors, LaunchSheet desktop layout, Stepper alignment, Select dark mode ([7cbe70c](https://github.com/juspay/shooter/commit/7cbe70c78d3d834b29d3638a69b05d7a71192512))
