// Tops up the demo accounts with testnet SUI from the issuer so the hosted demo keeps working.
// Only accounts below their target are topped up. Prints addresses and the digest, never keys.
//
//   node --import tsx scripts/top-up-gas.mts
import { readFileSync } from 'node:fs';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('MV_'))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const client = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const issuer = Ed25519Keypair.fromSecretKey(env.MV_ISSUER_KEY);
const MIST = 1_000_000_000;

// Yuki signs every payment; small shops sign staff stamps; the chain store never signs.
const shops: Record<string, string> = JSON.parse(env.MV_SHOP_KEYS);
const targets: [string, string, number][] = [
  ['Yuki', Ed25519Keypair.fromSecretKey(env.MV_RESIDENT_KEY).toSuiAddress(), 0.4],
  ...Object.entries(shops)
    .filter(([id]) => id !== 'market')
    .map(([id, key]) => [id, Ed25519Keypair.fromSecretKey(key).toSuiAddress(), 0.12] as [string, string, number]),
];

const sends: [string, string, number][] = [];
for (const [name, owner, target] of targets) {
  const { balance } = await client.getBalance({ owner });
  const have = Number(balance.balance) / MIST;
  if (have < target) sends.push([name, owner, Math.round((target - have) * MIST)]);
  console.log(`${name.padEnd(8)} ${have.toFixed(3)} SUI${have < target ? ` -> ${target}` : ''}`);
}
if (!sends.length) process.exit(0);

const tx = new Transaction();
const coins = tx.splitCoins(tx.gas, sends.map(([, , mist]) => tx.pure.u64(mist)));
sends.forEach(([, owner], i) => tx.transferObjects([coins[i]], owner));
const result = await client.signAndExecuteTransaction({ transaction: tx, signer: issuer });
const done = result.Transaction ?? result.FailedTransaction;
await client.waitForTransaction({ digest: done.digest });
console.log(`${result.$kind === 'Transaction' ? 'Topped up' : 'FAILED'}: ${done.digest}`);
