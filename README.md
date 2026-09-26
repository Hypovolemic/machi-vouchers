# Machi Vouchers · まちバウチャー

**A chamber of commerce issues premium shopping vouchers on Sui that only work at registered local shops, pay the shop in the same transaction as the resident pays, and show the funding city where every yen went.**

[Live demo](https://machi-vouchers.vercel.app) · [Package on Sui testnet](https://suiscan.xyz/testnet/object/0xd7e7f9b953292af6409a0a0857801d26ea4a2fcc74fe2a2654f8d810cad009ee) · [City dashboard](https://machi-vouchers.vercel.app/admin) · [Testnet deployment record](docs/testnet-deployment.md)

Built solo for ETHGlobal Tokyo 2026. Entered for **Sui: DeFi & Payments** and **Curvegrid: Best Digital Asset Dashboard**.

## The problem

Every year Japanese towns fund premium shopping vouchers ("プレミアム付商品券"): pay ¥10,000, spend ¥12,000 at local shops (Suginami Ward's 2026 program). Most are still paper: a 2025 survey of 625 programs found over 70% issued on paper or as paper-plus-digital hybrids (Gigi Inc., Dec 2025). Shops count used vouchers and carry them back to be reimbursed, and the city sees a final report rather than the flow of its subsidy.

People are ready for something better: 95% of people in their 60s and 86% in their 70s own a smartphone (NTT Docomo Mobile Society Research Institute, Jan 2026, n=1,300), and in a 2025 survey of small retailers 92% already take cashless payments, with 58% naming fees as their top complaint (BtoB Research, Aug 2025, n=124).

## Try it in a minute

The hosted demo runs on **Sui testnet** with demo accounts that the server signs for, so you don't need a wallet. Every action is a real testnet transaction with a Suiscan link. Demo yen (dJPY) only; no real money.

1. Open [Yuki's card](https://machi-vouchers.vercel.app/r): small-shop (中小店舗券) and any-shop (共通券) balances and the stamp rally, read from Sui.
2. **Pay Ramen Taro ¥1,200** with small-shop vouchers. The shop receives ¥1,200 in the same transaction; open it on Suiscan.
3. **Get a stamp at Komugi Bakery**: open the [staff screen](https://machi-vouchers.vercel.app/s/stamp?shop=bakery), tap **+1 stamp**, then **Confirm stamp**. Try again: one stamp per shop per day.
4. **Try small-shop vouchers at Everyday Market**, a supermarket chain: the contract refuses.
5. **Try to send vouchers to a friend**: the token policy refuses.
6. Open the [city dashboard](https://machi-vouchers.vercel.app/admin).

Stamps from five different small shops release a ¥500 bonus. Stamp limits reset at midnight Japan time.

## For Sui judges: DeFi & Payments

| The track asks for                        | Machi Vouchers                                                                                                                                                                                                                                                                                         | Where to look                                                                                                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Payment flows** that **move** money     | One call spends the voucher, pays the shop the same amount of dJPY from the program vault and adds the day's stamp: all or nothing                                                                                                                                                                     | `pay_local` / `pay_any` and `payout` in [program.move#L265-L298](contracts/machi_voucher/sources/program.move#L265-L298), [#L351-L366](contracts/machi_voucher/sources/program.move#L351-L366) |
| **Vaults** that **manage** money          | A shared `Program` holds the city's subsidy and residents' payments. Sales stay closed until the full premium and bonus reserve is funded; after the use period the remainder returns to the city once                                                                                                 | [#L163](contracts/machi_voucher/sources/program.move#L163), [#L251](contracts/machi_voucher/sources/program.move#L251), `close` at [#L323](contracts/machi_voucher/sources/program.move#L323)  |
| **Transform** money                       | ¥10,000 dJPY becomes ¥12,000 of two restricted voucher tokens; a rally bonus ticket becomes ¥500 of small-shop vouchers                                                                                                                                                                                | `buy` at [#L240](contracts/machi_voucher/sources/program.move#L240), `claim_bonus` at [#L313](contracts/machi_voucher/sources/program.move#L313)                                               |
| **Intelligently**                         | The rules live in the money. Both vouchers are Closed-Loop Tokens whose policy allows only `spend`, and only with our `ShopRule` approval, added after checking the shop is registered, active, small (for 中小店舗券) and within the dates. There is no rule for `transfer`, `to_coin` or `from_coin` | Policy at [#L142-L160](contracts/machi_voucher/sources/program.move#L142-L160), `check_shop` at [#L335](contracts/machi_voucher/sources/program.move#L335)                                     |
| **Automation**                            | Payments stamp automatically (once per shop per day); the fifth distinct small shop issues a bonus ticket; the shared `Clock` enforces sale and use windows in Japan time; events feed the shop counter and the dashboard                                                                              | `stamp` at [#L370](contracts/machi_voucher/sources/program.move#L370), `jst_day` at [#L343](contracts/machi_voucher/sources/program.move#L343)                                                 |
| **Composable**                            | Payments are programmable transaction blocks that join and split voucher `Token`s and call public Move functions, so a POS or a city app can compose the same calls                                                                                                                                    | [src/lib/server/chain.ts](src/lib/server/chain.ts) (`pay`)                                                                                                                                     |
| **Financial abstractions for real users** | Residents see vouchers, stamps and shops, never tokens, gas or addresses; staff give a stamp with +1 and Confirm; the card can be added to Google Wallet or Apple Wallet                                                                                                                               | [src/features/](src/features/)                                                                                                                                                                 |

The voucher `TreasuryCap`s move into the `Program` at launch, so from then on vouchers are only minted by `buy` and `claim_bonus`.

## On Sui testnet

| Object             | ID                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Package            | [`0xd7e7…09ee`](https://suiscan.xyz/testnet/object/0xd7e7f9b953292af6409a0a0857801d26ea4a2fcc74fe2a2654f8d810cad009ee) |
| `Program` (shared) | [`0xec1a…816a`](https://suiscan.xyz/testnet/object/0xec1a6890d4ec32dd90b14d6ee4b4e613072ca4b6227963fdfeb0656793b7816a) |

The program: ¥10,000 buys ¥12,000 (half small-shop, half any-shop), 100 sets, a five-shop rally with a ¥500 bonus, sales until 3 Oct 2026 and use until 31 Oct 2026 (JST). The city deposited the full ¥225,000 reserve before the first sale.

Setup transactions (publish, launch, register shops, the city's deposit, Yuki's first purchase) are in [docs/testnet-deployment.md](docs/testnet-deployment.md). Payments made from the app:

| From        | What                                            | Transaction                                                                                 |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Hosted demo | Any-shop ¥100 at Everyday Market                | [`ubSZDi…FbJa`](https://suiscan.xyz/testnet/tx/ubSZDir2WyskZqkDmiPXErpkauUR4s3w2qNq4qKFbJa) |
| Local app   | Small-shop ¥100 at Hana Florist, with its stamp | [`7cLWof…Pjx`](https://suiscan.xyz/testnet/tx/7cLWofqn7FxWehrhJcqtzZvbRYNwu52LJgimJEQqwPjx) |
| Local app   | Any-shop ¥800 at Everyday Market                | [`5KgPnN…Ew9`](https://suiscan.xyz/testnet/tx/5KgPnNmZefhqPaZyykZ8er2dPmP7FZaScvAJdhEDxEw9) |

**Refusals.** The app sends rule breaks to the contract rather than blocking them itself. The Sui SDK checks each transaction against the chain before signing, so a refused action shows the contract's own abort (for example `program::check_shop · abort code 8` for small-shop vouchers at a chain store, or `token::confirm_request · abort code 0` for a transfer) and nothing is signed. The same refusals are covered as onchain aborts by the Move tests.

## For Curvegrid judges: the master dashboard

_Best Digital Asset Dashboard._

**One sentence:** the master dashboard shows a chamber of commerce and the city that funds it where a subsidized voucher program's money went, which shops need attention and what to do next, read from the same Sui records that move the money.

It is a treasury dashboard for a public program. The assets are the program vault (the city's subsidy and residents' payments in dJPY) and the two voucher tokens in circulation; the shops are businesses paid in tokens. [Open it](https://machi-vouchers.vercel.app/admin).

| Section        | What it shows                                                                                                                                                                              | Decision it supports                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **Understand** | Subsidy deposited against what the program needs; voucher sets sold against the cap; vouchers spent against issued, and the share spent at small shops; the program vault and bonuses left | Is the public money doing its job?             |
| **Act**        | Every shop with takings, stamps and area. Shops with no takings are flagged "No takings yet: call them"                                                                                    | Which shops the chamber should visit this week |
| **Check**      | Every onchain event behind the figures, each linked to its transaction on Suiscan                                                                                                          | Audit any number event by event                |

- **Where the numbers come from:** read live from Sui testnet: the `Program` object, each shop's dJPY balance, and the package's events ([src/lib/server/chain.ts](src/lib/server/chain.ts), [src/features/admin.tsx](src/features/admin.tsx)).
- **How MultiBaas was used:** it wasn't. Machi Vouchers runs on Sui, and MultiBaas targets EVM chains.
- **MultiBaas feedback:** I looked at MultiBaas for this track. Its event indexer, webhooks and decoded transaction explorer are what this dashboard needs; on Sui I read events and object state directly with the Mysten SDK. If MultiBaas indexed Sui Move events, I would have used it for the Check section.
- **Team, setup and testing:** see [Team](#team) and [Run it yourself](#run-it-yourself).

## The wallet pass

A resident can add the card to **Apple Wallet or Google Wallet** (issued through PassEntry). The pass shows the vouchers, the small-shop balance, the stamp rally and the expiry, all copied from Sui, and it updates after every payment, stamp and bonus. Its QR is the resident's Sui address, the same as the in-app card: it identifies the card and can't pay. The back of the pass states the Sui address and program and links to Suiscan, so anyone can check the balance on chain. See [src/lib/server/pass.ts](src/lib/server/pass.ts).

Verified: the pass is issued and updated from Sui state (checked through PassEntry's API after each payment), and PassEntry reports it installed on an Android device. Not yet verified: Apple Wallet on an iPhone. The pass uses a PassEntry trial, so it carries a trial watermark.

## What's real and what's demo

- **Real:** the Move package and its 19 tests; the testnet deployment; every payment, stamp, bonus and purchase in the hosted demo is a signed Sui testnet transaction; the dashboard reads live chain data; the wallet pass is issued and updated by PassEntry.
- **Demo:** one demo resident (Yuki) and six fictional shops in a demo city; the server holds their testnet keys and signs for them so visitors need no wallet; dJPY is a demo token the issuer can mint; purchase tickets are issued by the server.
- **Not built:** Google sign-in (zkLogin) and sponsored fees, camera scanning at the counter, family cards, per-person purchase limits onchain (the purchase ticket is the limit), and bank settlement of real yen.

## Run it yourself

Prerequisites: Node.js 22+ and [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) 1.80.1.

```bash
npm ci
npm run move:test          # 19 Move tests

cp .env.example .env.local # then fund your Sui CLI address from https://faucet.sui.io (testnet)
npm run setup:testnet      # publishes, launches, registers shops, funds, and buys Yuki's first set
npm run dev                # http://127.0.0.1:3000
```

`setup:testnet` writes the IDs and demo keys to `.env.local` (git-ignored) and prints only addresses and transaction links. `node --import tsx scripts/top-up-gas.mts` refills the demo accounts' testnet SUI. Other checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Repository layout

- `contracts/machi_voucher/`: the Sui Move package (`program`, the two voucher currencies, dJPY) and its tests
- `src/app/`: pages (`/r`, `/r/pay`, `/r/shops`, `/s`, `/s/stamp`, `/admin`) and API routes
- `src/features/`: the resident, staff and dashboard screens
- `src/lib/server/`: Sui reads and demo signing (`chain.ts`), the wallet pass (`pass.ts`)
- `scripts/`: testnet setup and gas top-up
- `docs/`: the testnet deployment record and the AI usage record

## Team

- **Wei Feng**: product, design and build. GitHub [@Hypovolemic](https://github.com/Hypovolemic)

<!-- TODO(before submit): add X / LinkedIn handles. -->

## AI usage

Built with AI assistance, disclosed as ETHGlobal requires. The product spec, design conventions and pitch plan were written with AI help; the code was written with Claude Code (Claude Opus 5.5) under my direction and reviewed and committed by me. [docs/ai-usage.md](docs/ai-usage.md) lists what was made how.
