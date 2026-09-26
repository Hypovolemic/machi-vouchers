// One-time Sui testnet setup: publish, launch, register shops, fund, and give Yuki one set.
// Secrets go only to .env.local (git-ignored) and are never printed; addresses and digests are.
// Resumable: finished steps are saved in .data/deployment.json and skipped on rerun.
//
//   node --import tsx scripts/setup-testnet.mts
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { fromBase64 } from '@mysten/sui/utils';
import { SHOPS } from '../src/lib/shops';

const ENV_FILE = '.env.local';
const STATE_FILE = '.data/deployment.json';
const PACKAGE_DIR = 'contracts/machi_voucher';
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

// Suginami-style program: ¥10,000 buys ¥12,000, half small-shop only.
const PRICE = 10_000;
const PREMIUM_BPS = 2_000;
const LOCAL_SHARE_BPS = 5_000;
const MAX_SETS = 100;
const RALLY_TARGET = 5;
const RALLY_BONUS = 500;
const MAX_BONUSES = 50;
const SALE_END = Date.parse('2026-10-03T23:59:00+09:00');
const USE_END = Date.parse('2026-10-31T23:59:00+09:00');
const REQUIRED = MAX_SETS * Math.ceil((PRICE * PREMIUM_BPS) / 10_000) + MAX_BONUSES * RALLY_BONUS;

type State = Record<string, string>;
const state: State = existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {};
const save = () => {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), { mode: 0o600 });
};

// ---- .env.local, read and written without ever echoing values ----
let env = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8') : '';
const getEnv = (name: string) => env.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim() || '';
function setEnv(name: string, value: string) {
  env = new RegExp(`^${name}=`, 'm').test(env)
    ? env.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`)
    : `${env.trimEnd()}\n${name}=${value}\n`;
  writeFileSync(ENV_FILE, env, { mode: 0o600 });
}

/** The issuer is the Sui CLI's active address, funded from the faucet. */
function issuerFromKeystore(): Ed25519Keypair {
  const config = path.join(homedir(), '.sui', 'sui_config');
  const active = readFileSync(path.join(config, 'client.yaml'), 'utf8').match(
    /active_address:\s*"?(0x[0-9a-f]+)/,
  )?.[1];
  const keys: string[] = JSON.parse(readFileSync(path.join(config, 'sui.keystore'), 'utf8'));
  for (const entry of keys) {
    const bytes = fromBase64(entry);
    if (bytes[0] !== 0) continue; // ed25519 only
    const kp = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (kp.toSuiAddress() === active) return kp;
  }
  throw new Error('Active Sui CLI address not found in the keystore.');
}

function keyFor(name: string, make: () => Ed25519Keypair) {
  const existing = getEnv(name);
  if (existing) return Ed25519Keypair.fromSecretKey(existing);
  const kp = make();
  setEnv(name, kp.getSecretKey());
  return kp;
}

const issuer = keyFor('MV_ISSUER_KEY', issuerFromKeystore);
const funder = keyFor('MV_FUNDER_KEY', () => Ed25519Keypair.generate());
const resident = keyFor('MV_RESIDENT_KEY', () => Ed25519Keypair.generate());
const shopKeys: Record<string, string> = getEnv('MV_SHOP_KEYS')
  ? JSON.parse(getEnv('MV_SHOP_KEYS'))
  : {};
for (const shop of SHOPS) shopKeys[shop.id] ??= Ed25519Keypair.generate().getSecretKey();
setEnv('MV_SHOP_KEYS', JSON.stringify(shopKeys));
const shopAddress = (id: string) => Ed25519Keypair.fromSecretKey(shopKeys[id]).toSuiAddress();

console.log(`Issuer   ${issuer.toSuiAddress()}`);
console.log(`Funder   ${funder.toSuiAddress()}`);
console.log(`Resident ${resident.toSuiAddress()} (Yuki)`);
for (const shop of SHOPS) console.log(`Shop     ${shopAddress(shop.id)} ${shop.name}`);

async function run(label: string, signer: Ed25519Keypair, build: (tx: Transaction) => void) {
  if (state[label]) {
    console.log(`skip ${label}: ${state[label]}`);
    return null;
  }
  const tx = new Transaction();
  build(tx);
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer,
    include: { effects: true, objectTypes: true },
  });
  const done = result.Transaction ?? result.FailedTransaction;
  if (result.$kind !== 'Transaction')
    throw new Error(`${label} failed: ${JSON.stringify(done.effects?.status)}`);
  await client.waitForTransaction({ digest: done.digest });
  state[label] = done.digest;
  save();
  console.log(`ok   ${label}: ${done.digest}`);
  return done;
}

function created(types: Record<string, string> | undefined, suffix: string) {
  const hit = Object.entries(types || {}).find(([, t]) => t.endsWith(suffix));
  if (!hit) throw new Error(`No created object of type ...${suffix}`);
  return hit[0];
}

// 1. Publish
if (!state.packageId) {
  const out = execFileSync('sui', ['move', 'build', '--dump-bytecode-as-base64', '--path', PACKAGE_DIR], {
    encoding: 'utf8',
  });
  const { modules, dependencies } = JSON.parse(out.trim().split('\n').at(-1)!);
  const tx = await run('publish', issuer, (t) => {
    const [upgrade] = t.publish({ modules, dependencies });
    t.transferObjects([upgrade], issuer.toSuiAddress());
  });
  const types = tx!.objectTypes!;
  const pkg = Object.entries(types).find(([, t]) => t.endsWith('::program::IssuerCap'))![1].split('::')[0];
  Object.assign(state, {
    packageId: pkg,
    issuerCap: created(types, '::program::IssuerCap'),
    anyCap: created(types, `TreasuryCap<${pkg}::any_voucher::ANY_VOUCHER>`),
    localCap: created(types, `TreasuryCap<${pkg}::local_voucher::LOCAL_VOUCHER>`),
    djpyCap: created(types, `TreasuryCap<${pkg}::djpy::DJPY>`),
  });
  save();
}
const pkg = state.packageId;
const DJPY = `${pkg}::djpy::DJPY`;

// 2. Launch
if (!state.programId) {
  const tx = await run('launch', issuer, (t) =>
    t.moveCall({
      target: `${pkg}::program::launch`,
      arguments: [
        t.object(state.issuerCap),
        t.object(state.anyCap),
        t.object(state.localCap),
        t.pure.address(funder.toSuiAddress()),
        ...[PRICE, PREMIUM_BPS, LOCAL_SHARE_BPS, MAX_SETS, RALLY_TARGET, RALLY_BONUS, MAX_BONUSES].map(
          (v) => t.pure.u64(v),
        ),
        t.pure.u64(SALE_END),
        t.pure.u64(USE_END),
        t.object.clock(),
      ],
    }),
  );
  const types = tx!.objectTypes!;
  Object.assign(state, {
    programId: created(types, '::program::Program'),
    localPolicyId: created(types, `TokenPolicy<${pkg}::local_voucher::LOCAL_VOUCHER>`),
    anyPolicyId: created(types, `TokenPolicy<${pkg}::any_voucher::ANY_VOUCHER>`),
  });
  save();
}

// 3. Register the shops
await run('register shops', issuer, (t) => {
  for (const shop of SHOPS)
    t.moveCall({
      target: `${pkg}::program::register_shop`,
      arguments: [
        t.object(state.issuerCap),
        t.object(state.programId),
        t.pure.address(shopAddress(shop.id)),
        t.pure.string(shop.name),
        t.pure.u8(shop.tier === 'small' ? 0 : 1),
      ],
    });
});

// 4. Gas for the demo accounts (shops need it to sign staff stamps)
await run('gas for demo accounts', issuer, (t) => {
  const recipients = [funder.toSuiAddress(), resident.toSuiAddress(), ...SHOPS.map((s) => shopAddress(s.id))];
  const coins = t.splitCoins(t.gas, recipients.map(() => t.pure.u64(60_000_000)));
  recipients.forEach((to, i) => t.transferObjects([coins[i]], to));
});

// 5. The city's subsidy: mint demo yen to the funder, who deposits the full reserve
await run('mint dJPY to the funder', issuer, (t) =>
  t.moveCall({
    target: '0x2::coin::mint_and_transfer',
    typeArguments: [DJPY],
    arguments: [t.object(state.djpyCap), t.pure.u64(REQUIRED), t.pure.address(funder.toSuiAddress())],
  }),
);
await run('funder deposits the subsidy', funder, (t) =>
  t.moveCall({
    target: `${pkg}::program::fund_subsidy`,
    arguments: [t.object(state.programId), coinWithBalance({ type: DJPY, balance: REQUIRED })],
  }),
);

// 6. Yuki's purchase ticket and demo yen, then her purchase
await run('grant Yuki a purchase ticket and demo yen', issuer, (t) => {
  t.moveCall({
    target: `${pkg}::program::grant_right`,
    arguments: [
      t.object(state.issuerCap),
      t.object(state.programId),
      t.pure.address(resident.toSuiAddress()),
      t.pure.u64(1),
    ],
  });
  t.moveCall({
    target: '0x2::coin::mint_and_transfer',
    typeArguments: [DJPY],
    arguments: [t.object(state.djpyCap), t.pure.u64(PRICE), t.pure.address(resident.toSuiAddress())],
  });
});
if (!state['Yuki buys one set']) {
  const { objects } = await client.listOwnedObjects({
    owner: resident.toSuiAddress(),
    type: `${pkg}::program::PurchaseRight`,
  });
  await run('Yuki buys one set', resident, (t) =>
    t.moveCall({
      target: `${pkg}::program::buy`,
      arguments: [
        t.object(state.programId),
        t.object(objects[0].objectId),
        coinWithBalance({ type: DJPY, balance: PRICE }),
        t.object.clock(),
      ],
    }),
  );
}

// Public IDs for the app (not secrets)
for (const [name, key] of [
  ['MV_PACKAGE_ID', 'packageId'],
  ['MV_PROGRAM_ID', 'programId'],
  ['MV_LOCAL_POLICY_ID', 'localPolicyId'],
  ['MV_ANY_POLICY_ID', 'anyPolicyId'],
  ['MV_ISSUER_CAP_ID', 'issuerCap'],
  ['MV_DJPY_CAP_ID', 'djpyCap'],
] as const)
  setEnv(name, state[key]);
console.log('\nPackage', pkg, '\nProgram', state.programId);
console.log('Setup complete. IDs written to .env.local; secrets were never printed.');
