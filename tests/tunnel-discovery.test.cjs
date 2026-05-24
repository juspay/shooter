/**
 * Unit tests for bin/lib/tunnel-discovery.cjs.
 *
 * Pure parser tests + a self-heal roundtrip on a temp plist file.
 * No real launchctl interaction.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  parseCloudflaredConfig,
  parseLaunchAgentPlist,
  rewritePlistBinaryPath,
  ingressMatchesPort,
  hostnameFromIngress,
} = require('../bin/lib/tunnel-discovery.cjs');

let passed = 0;
let failed = 0;
const failures = [];

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL ${name}`);
    console.log(`       ${err.message}`);
    failed++;
    failures.push({ name, err });
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}: expected ${e}, got ${a}`);
}

function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg);
}

// ── Test 1: parseCloudflaredConfig basic ─────────────────────────────

runTest('parseCloudflaredConfig: extracts tunnel uuid, credentials, and ingress', () => {
  const yaml = `
tunnel: ba1f2887-af40-4a5e-acef-d394d344c322
credentials-file: /Users/foo/.cloudflared/ba1f2887-af40-4a5e-acef-d394d344c322.json

ingress:
  - hostname: shooter.example.dev
    service: http://localhost:54006
  - service: http_status:404
`;
  const cfg = parseCloudflaredConfig(yaml);
  assertEqual(cfg.tunnel, 'ba1f2887-af40-4a5e-acef-d394d344c322', 'tunnel uuid');
  assertEqual(
    cfg.credentialsFile,
    '/Users/foo/.cloudflared/ba1f2887-af40-4a5e-acef-d394d344c322.json',
    'credentials file'
  );
  assertEqual(cfg.ingress.length, 2, 'ingress entry count');
  assertEqual(cfg.ingress[0].hostname, 'shooter.example.dev', 'first ingress hostname');
  assertEqual(cfg.ingress[0].service, 'http://localhost:54006', 'first ingress service');
});

// ── Test 2: parseCloudflaredConfig with comments + quotes ────────────

runTest('parseCloudflaredConfig: handles comments and quoted values', () => {
  const yaml = `
# top-level comment
tunnel: "my-tunnel-uuid"
ingress:
  - hostname: 'host.example.dev'  # inline comment
    service: http://127.0.0.1:54007
`;
  const cfg = parseCloudflaredConfig(yaml);
  assertEqual(cfg.tunnel, 'my-tunnel-uuid', 'quoted tunnel uuid');
  assertEqual(cfg.ingress[0].hostname, 'host.example.dev', 'quoted hostname');
  assertEqual(cfg.ingress[0].service, 'http://127.0.0.1:54007', 'service with 127.0.0.1');
});

// ── Test 3: ingressMatchesPort ──────────────────────────────────────

runTest('ingressMatchesPort: matches localhost and 127.0.0.1 forms', () => {
  const ingress = [
    { service: 'http://localhost:54006', hostname: 'a' },
    { service: 'http_status:404' },
  ];
  assertTrue(ingressMatchesPort(ingress, 54006), 'localhost:54006 should match port 54006');
  assertTrue(!ingressMatchesPort(ingress, 54007), 'port 54007 should not match');

  const ingress2 = [{ service: 'http://127.0.0.1:8080' }];
  assertTrue(ingressMatchesPort(ingress2, 8080), '127.0.0.1 form should match');
});

// Regression: substring matching used to false-positive on port prefixes
// (e.g. port 80 vs localhost:8080).
runTest('ingressMatchesPort: does not false-positive on port-prefix substring', () => {
  const ingress = [{ service: 'http://localhost:8080' }];
  assertTrue(!ingressMatchesPort(ingress, 80), 'port 80 must not match localhost:8080');
  assertTrue(!ingressMatchesPort(ingress, 8), 'port 8 must not match localhost:8080');
  assertTrue(ingressMatchesPort(ingress, 8080), 'exact port still matches');
});

// Ensure non-http schemes and catch-all rules are ignored.
runTest('ingressMatchesPort: ignores http_status, tcp, ssh schemes', () => {
  assertTrue(
    !ingressMatchesPort([{ service: 'http_status:404' }], 404),
    'http_status catch-all never matches'
  );
  assertTrue(
    !ingressMatchesPort([{ service: 'tcp://localhost:22' }], 22),
    'tcp:// scheme never matches'
  );
  assertTrue(
    !ingressMatchesPort([{ service: 'http://example.com:54006' }], 54006),
    'non-localhost host never matches'
  );
});

// Service URL with trailing path / query still matches on port.
runTest('ingressMatchesPort: matches when service URL has a path or trailing slash', () => {
  assertTrue(
    ingressMatchesPort([{ service: 'http://localhost:54006/' }], 54006),
    'trailing slash matches'
  );
  assertTrue(
    ingressMatchesPort([{ service: 'http://localhost:54006/api' }], 54006),
    'path suffix matches'
  );
});

// ── Test 4: hostnameFromIngress ─────────────────────────────────────

runTest('hostnameFromIngress: returns first hostname, skipping catch-all', () => {
  const ingress = [{ hostname: 'a.example.com', service: 'http://localhost:1' }];
  assertEqual(hostnameFromIngress(ingress), 'a.example.com', 'first hostname');
  assertEqual(hostnameFromIngress(null), null, 'null ingress returns null');
  assertEqual(
    hostnameFromIngress([{ service: 'http_status:404' }]),
    null,
    'no hostname returns null'
  );
});

// Regression: a tunnel routing several hostnames to several local ports
// must return the hostname for the *matched* port.
runTest('hostnameFromIngress: when port given, picks hostname bound to that port', () => {
  const ingress = [
    { hostname: 'other.example.dev', service: 'http://localhost:9999' },
    { hostname: 'shooter.example.dev', service: 'http://localhost:54006' },
    { service: 'http_status:404' },
  ];
  assertEqual(hostnameFromIngress(ingress, 54006), 'shooter.example.dev', 'matched-port hostname');
  assertEqual(
    hostnameFromIngress(ingress, 9999),
    'other.example.dev',
    'matched-port hostname (other entry)'
  );
  // No matching port — fall back to first hostname for back-compat.
  assertEqual(
    hostnameFromIngress(ingress, 1234),
    'other.example.dev',
    'no port match falls back to first hostname'
  );
});

// ── Test 5: parseLaunchAgentPlist ───────────────────────────────────

runTest('parseLaunchAgentPlist: extracts label and ProgramArguments', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>dev.example.shooter-tunnel</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/cloudflared</string>
        <string>tunnel</string>
        <string>--config</string>
        <string>/Users/foo/.cloudflared/shooter-config.yml</string>
        <string>run</string>
        <string>shooter-tunnel</string>
    </array>
</dict>
</plist>`;
  const p = parseLaunchAgentPlist(xml);
  assertEqual(p.label, 'dev.example.shooter-tunnel', 'label');
  assertDeepEqual(
    p.programArguments,
    [
      '/opt/homebrew/bin/cloudflared',
      'tunnel',
      '--config',
      '/Users/foo/.cloudflared/shooter-config.yml',
      'run',
      'shooter-tunnel',
    ],
    'ProgramArguments'
  );
});

// Regression: rewritePlistBinaryPath escapes &/</>, so the parser must
// unescape them on read — otherwise programArguments.includes(cfg.path)
// silently fails after a heal cycle on a path containing those chars.
runTest('parseLaunchAgentPlist: XML-unescapes &amp;, &lt;, &gt;, &quot;, &apos;', () => {
  const xml = `<?xml version="1.0"?>
<plist><dict>
  <key>Label</key><string>dev.example.a&amp;b</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/a&amp;b/&lt;bin&gt;/cloudflared</string>
    <string>he said &quot;hi&quot;</string>
    <string>it&apos;s ok</string>
  </array>
</dict></plist>`;
  const p = parseLaunchAgentPlist(xml);
  assertEqual(p.label, 'dev.example.a&b', 'label entity decoded');
  assertDeepEqual(
    p.programArguments,
    ['/Users/a&b/<bin>/cloudflared', 'he said "hi"', "it's ok"],
    'all entities decoded in programArguments'
  );
});

// ── Test 6: parseLaunchAgentPlist tolerates other arrays ────────────

runTest('parseLaunchAgentPlist: only captures ProgramArguments array, not others', () => {
  const xml = `<?xml version="1.0"?>
<plist><dict>
  <key>Label</key><string>x</string>
  <key>WatchPaths</key>
  <array>
    <string>/var/something</string>
    <string>/var/another</string>
  </array>
  <key>ProgramArguments</key>
  <array>
    <string>/real/binary</string>
    <string>run</string>
  </array>
</dict></plist>`;
  const p = parseLaunchAgentPlist(xml);
  assertDeepEqual(p.programArguments, ['/real/binary', 'run'], 'only ProgramArguments captured');
});

// ── Test 7: rewritePlistBinaryPath roundtrip ────────────────────────

runTest('rewritePlistBinaryPath: rewrites binary, leaves rest intact, writes .bak', () => {
  const tmp = path.join(os.tmpdir(), `shooter-tunnel-test-${process.pid}.plist`);
  const xml = `<?xml version="1.0"?>
<plist><dict>
  <key>Label</key><string>dev.example.tun</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/cloudflared</string>
    <string>tunnel</string>
    <string>run</string>
    <string>shooter-tunnel</string>
  </array>
</dict></plist>`;
  try {
    fs.writeFileSync(tmp, xml);

    rewritePlistBinaryPath(tmp, '/usr/local/bin/cloudflared', '/opt/homebrew/bin/cloudflared');

    const rewritten = fs.readFileSync(tmp, 'utf8');
    assertTrue(
      rewritten.includes('<string>/opt/homebrew/bin/cloudflared</string>'),
      'new path present'
    );
    assertTrue(!rewritten.includes('<string>/usr/local/bin/cloudflared</string>'), 'old path gone');
    // Subsequent args unchanged.
    assertTrue(rewritten.includes('<string>tunnel</string>'), 'second arg untouched');
    assertTrue(rewritten.includes('<string>shooter-tunnel</string>'), 'last arg untouched');

    const bak = fs.readFileSync(tmp + '.bak', 'utf8');
    assertEqual(bak, xml, '.bak preserves original');
  } finally {
    for (const f of [tmp, tmp + '.bak']) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* leave for next CI run to notice */
      }
    }
  }
});

// Regression: parse decodes entities and rewrite encodes them, so the
// equality check inside rewritePlistBinaryPath must compare in the
// decoded domain — otherwise healing a path that contains XML special
// chars throws "refusing to heal".
runTest('rewritePlistBinaryPath: round-trips a path containing & without throwing', () => {
  const tmp = path.join(os.tmpdir(), `shooter-tunnel-roundtrip-${process.pid}.plist`);
  // Plist on disk: path with literal `&` is encoded as `&amp;`
  const xml = `<?xml version="1.0"?>
<plist><dict>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/a&amp;b/cloudflared</string>
  </array>
</dict></plist>`;
  try {
    fs.writeFileSync(tmp, xml);
    // oldPath is what the parser would have produced — i.e. decoded.
    rewritePlistBinaryPath(tmp, '/Users/a&b/cloudflared', '/opt/homebrew/bin/cloudflared');
    const rewritten = fs.readFileSync(tmp, 'utf8');
    assertTrue(
      rewritten.includes('<string>/opt/homebrew/bin/cloudflared</string>'),
      'new path present'
    );
    assertTrue(
      !rewritten.includes('<string>/Users/a&amp;b/cloudflared</string>'),
      'old encoded path gone'
    );
  } finally {
    for (const f of [tmp, tmp + '.bak']) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* leave for next CI run to notice */
      }
    }
  }
});

// ── XML-escape: paths with &, <, > must be encoded ──────────────────

runTest('rewritePlistBinaryPath: XML-escapes newPath so & < > do not corrupt plist', () => {
  const tmp = path.join(os.tmpdir(), `shooter-tunnel-xmlescape-${process.pid}.plist`);
  const xml = `<?xml version="1.0"?>
<plist><dict>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/cloudflared</string>
  </array>
</dict></plist>`;
  try {
    fs.writeFileSync(tmp, xml);
    rewritePlistBinaryPath(tmp, '/usr/local/bin/cloudflared', '/Users/a&b/<bin>/cloudflared');
    const rewritten = fs.readFileSync(tmp, 'utf8');
    assertTrue(
      rewritten.includes('<string>/Users/a&amp;b/&lt;bin&gt;/cloudflared</string>'),
      'special chars are XML-encoded'
    );
    assertTrue(!rewritten.match(/<string>[^<]*<bin>[^<]*<\/string>/), 'no raw < inside <string>');
  } finally {
    for (const f of [tmp, tmp + '.bak']) {
      try {
        if (fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        /* leave for next CI run to notice */
      }
    }
  }
});

// ── Test 8: rewritePlistBinaryPath refuses on mismatch ──────────────

runTest('rewritePlistBinaryPath: refuses to rewrite when oldPath does not match', () => {
  const tmp = path.join(os.tmpdir(), `shooter-tunnel-mismatch-${process.pid}.plist`);
  const xml = `<?xml version="1.0"?>
<plist><dict>
  <key>ProgramArguments</key>
  <array><string>/some/other/path</string></array>
</dict></plist>`;
  try {
    fs.writeFileSync(tmp, xml);

    let threw = false;
    try {
      rewritePlistBinaryPath(tmp, '/usr/local/bin/cloudflared', '/new/path');
    } catch (err) {
      threw = true;
      assertTrue(
        err.message.includes('expected /usr/local/bin/cloudflared'),
        'error message mentions expected path'
      );
    }
    assertTrue(threw, 'must throw on mismatch');

    // File should be untouched.
    assertEqual(fs.readFileSync(tmp, 'utf8'), xml, 'file untouched after refused rewrite');
  } finally {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* leave for next CI run to notice */
    }
  }
});

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed, ${passed + failed} total\n`);
process.exit(failed > 0 ? 1 : 0);
