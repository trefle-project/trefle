# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Report it privately, either:

- through GitHub: **Security → Report a vulnerability** on this repository
  (private vulnerability reporting), or
- by e-mail to trefle@lafere.com.

Include what you found, how to reproduce it, and the impact you expect. You
will get an acknowledgement within 5 working days. Once a fix is ready, it is
released first and the advisory published afterwards, with credit to you if
you wish.

## Supported versions

Trefle is released as git tags. Only the latest release receives security
fixes.

## Scope

In scope: the code in this repository (`apps/`, `packages/`, `infra/`).
Out of scope: third-party services an installation uses (Cloudflare, the mail
provider, the hosting provider), and installations you do not operate.

## What the project already does

The design choices behind Trefle's security are documented in
[`docs/features.md`](docs/features.md#admin-security-and-operations) and in the
specs `002-security-hardening`, `017-edge-protection` and `019-admin-access`.
A production install refuses to start with missing or weak secrets
(`infra/deploy/preflight.sh`).
