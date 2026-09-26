// Server only: reads the program from Sui testnet and signs actions for the demo accounts.
// Keys come from server environment variables and never reach the browser.
import { bcs } from '@mysten/sui/bcs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { SHOPS, shopById } from '../shops';

export class AppError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function need(name: string) {
  const value = process.env[name];
  if (!value) throw new AppError(`The server is missing ${name}.`, 503);
  return value;
}

export const ids = () => ({
  pkg: need('MV_PACKAGE_ID'),
  program: need('MV_PROGRAM_ID'),
  localPolicy: need('MV_LOCAL_POLICY_ID'),
  anyPolicy: need('MV_ANY_POLICY_ID'),
  issuerCap: need('MV_ISSUER_CAP_ID'),
  djpyCap: need('MV_DJPY_CAP_ID'),
});

let client: SuiGrpcClient | undefined;
export const sui = () =>
  (client ??= new SuiGrpcClient({
    network: 'testnet',
    baseUrl: process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443',
  }));

const key = (secret: string) => Ed25519Keypair.fromSecretKey(secret);
export const issuer = () => key(need('MV_ISSUER_KEY'));
export const resident = () => key(need('MV_RESIDENT_KEY'));
function shopKeys(): Record<string, string> {
  return JSON.parse(need('MV_SHOP_KEYS'));
}
export const shopSigner = (id: string) => {
  const secret = shopKeys()[id];
  if (!secret) throw new AppError('Unknown shop.');
  return key(secret);
};
export const shopAddress = (id: string) => shopSigner(id).toSuiAddress();

// ---- BCS layouts, in the same field order as the Move structs ----
const u64 = bcs.u64();
const Table = bcs.struct('Table', { id: bcs.Address, size: u64 });
const Cap = bcs.struct('TreasuryCap', { id: bcs.Address, supply: u64 });
const ProgramBcs = bcs.struct('Program', {
  id: bcs.Address,
  funder: bcs.Address,
  price: u64,
  premium_bps: u64,
  local_share_bps: u64,
  max_sets: u64,
  sets_sold: u64,
  rally_target: u64,
  rally_bonus: u64,
  bonuses_left: u64,
  sale_end_ms: u64,
  use_end_ms: u64,
  required_funding: u64,
  funded: u64,
  closed: bcs.bool(),
  vault: u64,
  shops: Table,
  staff: Table,
  cards: Table,
  last_stamp: Table,
  any_cap: Cap,
  local_cap: Cap,
});
const TokenBcs = bcs.struct('Token', { id: bcs.Address, balance: u64 });
const CardBcs = bcs.struct('StampCard', { count: u64, rally_shops: bcs.vector(bcs.Address) });
const StampKeyBcs = bcs.struct('StampKey', { resident: bcs.Address, shop: bcs.Address });

const n = (v: string | number | bigint) => Number(v);

export async function readProgram() {
  const { object } = await sui().getObject({ objectId: ids().program, include: { content: true } });
  const p = ProgramBcs.parse(object.content);
  return {
    price: n(p.price),
    face: n(p.price) + Math.round((n(p.price) * n(p.premium_bps)) / 10_000),
    localShareBps: n(p.local_share_bps),
    maxSets: n(p.max_sets),
    setsSold: n(p.sets_sold),
    rallyTarget: n(p.rally_target),
    rallyBonus: n(p.rally_bonus),
    bonusesLeft: n(p.bonuses_left),
    saleEnd: n(p.sale_end_ms),
    useEnd: n(p.use_end_ms),
    requiredFunding: n(p.required_funding),
    funded: n(p.funded),
    closed: p.closed,
    vault: n(p.vault),
    mintedLocal: n(p.local_cap.supply),
    mintedAny: n(p.any_cap.supply),
    cardsTable: p.cards.id,
    lastStampTable: p.last_stamp.id,
  };
}

const voucherType = (voucher: 'local' | 'any') =>
  voucher === 'local'
    ? `${ids().pkg}::local_voucher::LOCAL_VOUCHER`
    : `${ids().pkg}::any_voucher::ANY_VOUCHER`;

async function tokens(owner: string, voucher: 'local' | 'any') {
  const { objects } = await sui().listOwnedObjects({
    owner,
    type: `0x2::token::Token<${voucherType(voucher)}>`,
    include: { content: true },
  });
  return objects
    .map((o) => ({ id: o.objectId, value: n(TokenBcs.parse(o.content).balance) }))
    .sort((a, b) => b.value - a.value);
}

async function dynamicValue(parentId: string, type: string, name: Uint8Array) {
  try {
    const { dynamicField } = await sui().getDynamicField({ parentId, name: { type, bcs: name } });
    return dynamicField.value.bcs;
  } catch {
    return null;
  }
}

const JST = 9 * 3_600_000;
const today = () => Math.floor((Date.now() + JST) / 86_400_000);

/** Yuki's card, straight from chain: balances, stamp card, bonus tickets, today's stamps. */
export async function readResident(program: Awaited<ReturnType<typeof readProgram>>) {
  const address = resident().toSuiAddress();
  const [local, any, card, tickets, stampedToday] = await Promise.all([
    tokens(address, 'local'),
    tokens(address, 'any'),
    dynamicValue(program.cardsTable, 'address', bcs.Address.serialize(address).toBytes()),
    sui().listOwnedObjects({ owner: address, type: `${ids().pkg}::program::BonusTicket` }),
    Promise.all(
      SHOPS.map(async (shop) => {
        const raw = await dynamicValue(
          program.lastStampTable,
          `${ids().pkg}::program::StampKey`,
          StampKeyBcs.serialize({ resident: address, shop: shopAddress(shop.id) }).toBytes(),
        );
        return raw && n(bcs.u64().parse(raw)) === today() ? shop.id : null;
      }),
    ),
  ]);
  const parsed = card ? CardBcs.parse(card) : null;
  const byAddress = new Map(SHOPS.map((s) => [shopAddress(s.id), s.id]));
  return {
    address,
    local: local.reduce((s, t) => s + t.value, 0),
    any: any.reduce((s, t) => s + t.value, 0),
    stamps: parsed ? n(parsed.count) : 0,
    rally: parsed ? parsed.rally_shops.map((a) => byAddress.get(a) || a) : [],
    bonusTickets: tickets.objects.length,
    stampedToday: stampedToday.filter(Boolean) as string[],
  };
}

export async function readShops() {
  const djpy = `${ids().pkg}::djpy::DJPY`;
  return Promise.all(
    SHOPS.map(async (shop) => {
      const address = shopAddress(shop.id);
      const { balance } = await sui().getBalance({ owner: address, coinType: djpy });
      return { ...shop, address, takings: n(balance.balance) };
    }),
  );
}

export type ChainEvent = {
  type: string;
  digest: string;
  shop?: string;
  amount?: number;
  local?: boolean;
  checkpoint: string | null;
};

export async function readEvents(limit = 40): Promise<ChainEvent[]> {
  const byAddress = new Map(SHOPS.map((s) => [shopAddress(s.id), s.id]));
  const { events } = await sui().listEvents({
    filter: { emitModule: `${ids().pkg}::program` },
    order: 'descending',
    limit,
  });
  const own = `${ids().pkg}::program::`;
  return events.filter((e) => e.eventType.startsWith(own)).map((e) => {
    const json = (e.json || {}) as Record<string, unknown>;
    const shop = typeof json.shop === 'string' ? byAddress.get(json.shop) || json.shop : undefined;
    return {
      type: e.eventType.split('::').at(-1)!,
      digest: e.transactionDigest,
      shop,
      amount: json.amount !== undefined ? n(json.amount as string) : undefined,
      local: typeof json.local === 'boolean' ? json.local : undefined,
      checkpoint: e.checkpoint,
    };
  });
}

// ---- Actions ----

const PROGRAM_ERRORS: Record<number, string> = {
  1: 'The voucher period has ended.',
  2: 'Voucher sales have closed.',
  3: 'All voucher sets are sold.',
  4: 'The payment does not match the set price.',
  5: 'The city has not deposited the full subsidy yet.',
  6: 'This shop is not registered in the program.',
  7: 'This shop is paused by the chamber.',
  8: 'Small-shop vouchers only work at small and independent shops. Use any-shop vouchers here.',
  9: 'Only a registered shop can give stamps.',
  10: 'A shop cannot stamp its own card.',
  11: 'Already stamped here today. Try a different small shop, or come back tomorrow.',
  15: 'Enter an amount above zero.',
};

export type ActionResult = {
  ok: boolean;
  digest: string;
  message: string;
  refusedBy?: string;
};

const queues = new Map<string, Promise<unknown>>();
/** One transaction at a time per signer on this server, so gas coins are never used twice. */
function serial<T>(signer: string, job: () => Promise<T>): Promise<T> {
  const next = (queues.get(signer) || Promise.resolve()).then(job, job);
  queues.set(signer, next.catch(() => undefined));
  return next;
}

async function execute(signer: Ed25519Keypair, tx: Transaction, ok: string): Promise<ActionResult> {
  // A fixed budget skips the dry run, so a rule break reaches the chain and the contract refuses it
  // in a real, linkable transaction.
  tx.setGasBudget(20_000_000);
  const owner = signer.toSuiAddress();
  return serial(owner, async () => {
    const [{ objects: coins }, { referenceGasPrice }] = await Promise.all([
      sui().listCoins({ owner, coinType: '0x2::sui::SUI' }),
      sui().getReferenceGasPrice(),
    ]);
    const gas = coins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))[0];
    if (!gas || BigInt(gas.balance) < BigInt(20_000_000))
      throw new AppError('This demo account is out of test SUI for fees. Ask the operator to top it up.', 503);
    tx.setSender(owner);
    tx.setGasPrice(BigInt(referenceGasPrice));
    tx.setGasPayment([{ objectId: gas.objectId, version: gas.version, digest: gas.digest }]);
    let result;
    try {
      result = await sui().signAndExecuteTransaction({
        transaction: tx,
        signer,
        include: { effects: true },
      });
    } catch (e) {
      // The SDK checks every transaction against the chain before signing. When the Move
      // contract aborts, nothing is signed; report the contract's own refusal.
      const text = (e as Error).message || '';
      const code = Number(text.match(/abort code: (\d+)/)?.[1]);
      const where = text.match(/::(\w+)::(\w+)'/);
      if (!where || Number.isNaN(code)) throw e;
      return {
        ok: false,
        digest: '',
        message:
          where[1] === 'token'
            ? 'Vouchers cannot be sent to another person. The token policy has no transfer rule.'
            : PROGRAM_ERRORS[code] || 'The contract refused this.',
        refusedBy: `${where[1]}::${where[2]} · abort code ${code} · refused by the Sui contract before signing`,
      };
    }
    const done = result.Transaction ?? result.FailedTransaction;
    await sui().waitForTransaction({ digest: done.digest });
    if (result.$kind === 'Transaction') return { ok: true, digest: done.digest, message: ok };
    const error = done.effects?.status.error;
    const abort = error?.$kind === 'MoveAbort' ? error.MoveAbort : undefined;
    const code = abort ? Number(abort.abortCode) : NaN;
    const where = abort?.location?.module;
    const message =
      where === 'token'
        ? 'Vouchers cannot be sent to another person. The token policy has no transfer rule.'
        : PROGRAM_ERRORS[code] || error?.message || 'The transaction was refused.';
    return {
      ok: false,
      digest: done.digest,
      message,
      refusedBy: where ? `${where} · abort code ${code}` : undefined,
    };
  });
}

const yen = (v: number) => `¥${v.toLocaleString('en-US')}`;

export async function pay(shopId: string, amount: number, voucher: 'local' | 'any') {
  const shop = shopById(shopId);
  if (!shop) throw new AppError('Choose a shop.');
  if (!Number.isInteger(amount) || amount <= 0 || amount > 100_000)
    throw new AppError('Enter an amount between ¥1 and ¥100,000.');
  const owned = await tokens(resident().toSuiAddress(), voucher);
  const total = owned.reduce((s, t) => s + t.value, 0);
  if (total < amount)
    throw new AppError(`Yuki has ${yen(total)} of ${voucher === 'local' ? 'small-shop' : 'any-shop'} vouchers.`);
  const type = voucherType(voucher);
  const tx = new Transaction();
  const [first, ...rest] = owned;
  for (const other of rest)
    tx.moveCall({ target: '0x2::token::join', typeArguments: [type], arguments: [tx.object(first.id), tx.object(other.id)] });
  const [part] = tx.moveCall({
    target: '0x2::token::split',
    typeArguments: [type],
    arguments: [tx.object(first.id), tx.pure.u64(amount)],
  });
  tx.moveCall({
    target: `${ids().pkg}::program::${voucher === 'local' ? 'pay_local' : 'pay_any'}`,
    arguments: [
      tx.object(ids().program),
      tx.object(voucher === 'local' ? ids().localPolicy : ids().anyPolicy),
      part,
      tx.pure.address(shopAddress(shop.id)),
      tx.object.clock(),
    ],
  });
  return execute(
    resident(),
    tx,
    `Paid ${yen(amount)} to ${shop.name}. The shop received ${yen(amount)} in the same transaction.`,
  );
}

export async function stamp(shopId: string) {
  const shop = shopById(shopId);
  if (!shop) throw new AppError('Choose a shop.');
  const tx = new Transaction();
  tx.moveCall({
    target: `${ids().pkg}::program::add_stamp`,
    arguments: [tx.object(ids().program), tx.pure.address(resident().toSuiAddress()), tx.object.clock()],
  });
  return execute(shopSigner(shop.id), tx, `${shop.name} added a stamp to Yuki's card.`);
}

export async function claimBonus() {
  const { objects } = await sui().listOwnedObjects({
    owner: resident().toSuiAddress(),
    type: `${ids().pkg}::program::BonusTicket`,
  });
  if (!objects.length) throw new AppError('No bonus to collect yet.');
  const tx = new Transaction();
  tx.moveCall({
    target: `${ids().pkg}::program::claim_bonus`,
    arguments: [tx.object(ids().program), tx.object(objects[0].objectId), tx.object.clock()],
  });
  return execute(resident(), tx, 'Bonus collected: ¥500 added to Yuki’s small-shop vouchers.');
}

/** Tries to send ¥100 of small-shop vouchers to a friend. The token policy refuses it onchain. */
export async function tryTransfer() {
  const owned = await tokens(resident().toSuiAddress(), 'local');
  if (!owned.length || owned[0].value < 100) throw new AppError('Yuki needs ¥100 of small-shop vouchers.');
  const type = voucherType('local');
  const tx = new Transaction();
  const [part] = tx.moveCall({
    target: '0x2::token::split',
    typeArguments: [type],
    arguments: [tx.object(owned[0].id), tx.pure.u64(100)],
  });
  const [request] = tx.moveCall({
    target: '0x2::token::transfer',
    typeArguments: [type],
    arguments: [part, tx.pure.address(shopAddress('market'))],
  });
  tx.moveCall({
    target: '0x2::token::confirm_request',
    typeArguments: [type],
    arguments: [tx.object(ids().localPolicy), request],
  });
  return execute(resident(), tx, 'Sent.');
}

/** A new purchase ticket and demo yen from the chamber, then Yuki buys one more set. */
export async function buySet() {
  const program = await readProgram();
  const djpy = `${ids().pkg}::djpy::DJPY`;
  const grant = new Transaction();
  grant.moveCall({
    target: `${ids().pkg}::program::grant_right`,
    arguments: [
      grant.object(ids().issuerCap),
      grant.object(ids().program),
      grant.pure.address(resident().toSuiAddress()),
      grant.pure.u64(1),
    ],
  });
  grant.moveCall({
    target: '0x2::coin::mint_and_transfer',
    typeArguments: [djpy],
    arguments: [grant.object(ids().djpyCap), grant.pure.u64(program.price), grant.pure.address(resident().toSuiAddress())],
  });
  const granted = await execute(issuer(), grant, 'Purchase ticket issued.');
  if (!granted.ok) return granted;
  const { objects } = await sui().listOwnedObjects({
    owner: resident().toSuiAddress(),
    type: `${ids().pkg}::program::PurchaseRight`,
  });
  const tx = new Transaction();
  tx.moveCall({
    target: `${ids().pkg}::program::buy`,
    arguments: [
      tx.object(ids().program),
      tx.object(objects[0].objectId),
      coinWithBalance({ type: djpy, balance: program.price }),
      tx.object.clock(),
    ],
  });
  return execute(
    resident(),
    tx,
    `Bought a set: paid ${yen(program.price)} and received ${yen(program.face)} in vouchers.`,
  );
}
