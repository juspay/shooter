# Homebrew formula for Shooter
# To use: brew tap juspay/shooter && brew install shooter

class Shooter < Formula
  desc "Mobile-first dev notifications & remote terminal for Claude Code"
  homepage "https://github.com/juspay/shooter"
  url "https://github.com/juspay/shooter/archive/refs/tags/v1.0.0.tar.gz"
  # TODO: Update URL and sha256 when first release is published
  # sha256 "PLACEHOLDER — run `shasum -a 256 <tarball>` after release"
  license "MIT"

  depends_on "node@22"

  def install
    # Enable corepack for pnpm
    system "corepack", "enable"
    system "corepack", "prepare", "pnpm@10.28.2", "--activate"

    # Install dependencies and build
    system "pnpm", "install", "--frozen-lockfile"
    system "pnpm", "build"

    # Install to libexec (keeps node_modules contained)
    libexec.install Dir["*"]

    # Create wrapper script
    (bin/"shooter").write <<~EOS
      #!/bin/bash
      exec "#{Formula["node@22"].opt_bin}/node" "#{libexec}/bin/shooter.cjs" "$@"
    EOS
  end

  def post_install
    (var/"log/shooter").mkpath
    (var/"lib/shooter").mkpath
    ohai "Run 'shooter setup' to configure Shooter before starting the service"
    ohai "Then: brew services start shooter"
  end

  service do
    run [opt_bin/"shooter", "start"]
    keep_alive crashed: true
    log_path var/"log/shooter/stdout.log"
    error_log_path var/"log/shooter/stderr.log"
    working_dir var/"lib/shooter"
  end

  test do
    assert_match "shooter v", shell_output("#{bin}/shooter version")
  end
end
