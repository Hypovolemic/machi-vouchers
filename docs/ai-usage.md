# AI usage

ETHGlobal allows AI tools if their use is disclosed. This is the record for Machi Vouchers, kept up to date as the project is built.

## Product, design and pitch

The product requirements (PRD), design conventions and pitch plan were written by Wei Feng (Hypovolemic) with AI assistance during planning. They are the source for everything below.

## Code and docs

| Area | Files | How it was made |
| --- | --- | --- |
| Move package | `contracts/machi_voucher/` | Claude Code (Claude Opus 5.5), directed by Wei Feng, from the PRD's reference Move sketch (Appendix A), with the fixes the PRD lists: borrow order in `stamp`, `confirm_request_mut`'s return value, a stored funder for the refund at close, `suspend_shop` |
| Move tests | `contracts/machi_voucher/tests/` | Claude Code, from the PRD's test plan (U1–U14) |
| App scaffold | `web/` (initial files) | `create-next-app` |
| Testnet setup script | `web/scripts/setup-testnet.mts` | Claude Code |
| Deployment record | `docs/testnet-deployment.md` | Generated from the setup script's recorded digests |

Every change was reviewed and committed by Wei Feng.
