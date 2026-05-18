# Security

## Malicious workflow removed (May 2026)

A commit authored as `build-bot <ci-bot@automated.dev>` added `.github/workflows/ci.yml` (`SysDiag`) containing obfuscated code that attempted to exfiltrate secrets from GitHub Actions runners. That workflow and commit have been **removed from git history**.

### If this repository was public when that commit existed

1. **Rotate secrets immediately**: GitHub PATs, `GITHUB_TOKEN` exposure scope, AWS keys, SSH keys, npm tokens, and any credentials in the repo or org.
2. In GitHub: **Settings → Actions → Disable actions** (or restrict to trusted workflows only) until you audit runners.
3. Review **Actions** tab for unexpected workflow runs on `pull_request_target`.
4. Audit collaborators and deploy keys.

### Prevention

- Enable `scripts/git-hooks` locally: `git config core.hooksPath scripts/git-hooks`
- Project rule: `.cursor/rules/no-bot-attribution.mdc`
- Never merge unsolicited workflow files.
