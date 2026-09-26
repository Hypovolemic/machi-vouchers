# AI usage

ETHGlobal allows AI tools if their use is disclosed. This is the record for Machi Vouchers, kept up to date as the project is built.

## Product, design and pitch

The product requirements (PRD), design conventions and pitch plan were written by Wei Feng (Hypovolemic) with AI assistance during planning. They are the source for everything below.

## Code and docs

| Area | Files | How it was made |
| --- | --- | --- |
| Move package | `contracts/machi_voucher/` | Claude Code (Claude Opus 5.5), directed by Wei Feng, from the PRD's reference Move sketch (Appendix A), with the fixes the PRD lists: borrow order in `stamp`, `confirm_request_mut`'s return value, a stored funder for the refund at close, `suspend_shop` |
| Move tests | `contracts/machi_voucher/tests/` | Claude Code, from the PRD's test plan (U1–U14) |
| App scaffold | Initial Next.js files (first in `web/`, then moved to the repo root) | `create-next-app` |
| Testnet setup script | `scripts/setup-testnet.mts` | Claude Code |
| Deployment record | `docs/testnet-deployment.md` | Generated from the setup script's recorded digests |
| Chain reads and demo signing | `src/lib/server/chain.ts`, `src/app/api/` | Claude Code, using the Mysten Sui TypeScript SDK docs |
| Screens | `src/app/`, `src/features/`, `src/components/` | Claude Code, from the PRD's views (section 9) and the design conventions (v1.2 tokens), with plain wording |
| Wallet pass | `src/lib/server/pass.ts`, `src/app/api/pass/` | Claude Code, from PassEntry's API reference and the team's published PassEntry template (`machi-voucher-demo`) |

Every change was reviewed and committed by Wei Feng.
