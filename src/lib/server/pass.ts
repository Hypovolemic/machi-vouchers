// Server only: Yuki's Apple Wallet / Google Wallet pass through PassEntry.
// The pass is a display copy of chain state. Its QR is Yuki's Sui address; it can't move money.
import { AppError, ids, readProgram, readResident } from './chain';
import { SHOPS } from '../shops';

const API = 'https://api.passentry.com/api/v1';

export const passEnabled = () =>
  !!process.env.PASSENTRY_API_KEY && !!process.env.PASSENTRY_TEMPLATE_ID;

async function call(path: string, method = 'GET', body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.PASSENTRY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const yen = (v: number) => v.toLocaleString('en-US');
const day = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Tokyo' });

export type LastTransaction = { message: string; digest: string };

// Keys of the published PassEntry template "machi-voucher-demo" (a store card).
async function current(last?: LastTransaction) {
  const program = await readProgram();
  const resident = await readResident(program);
  const perShop = SHOPS.filter((shop) => resident.shopStamps[shop.id] > 0)
    .map((shop) => `${shop.name} ${resident.shopStamps[shop.id]}`)
    .join(', ');
  const extId = `mv-${ids().program.slice(2, 10)}-${resident.address.slice(2, 10)}`;
  const pass = {
    vouchers: { value: yen(resident.local + resident.any) },
    stamp_rally_front: { value: `${resident.rally.length} / ${program.rallyTarget}` },
    small_shops: { value: yen(resident.local) },
    valid_until: { value: day(program.useEnd) },
    how_to_pay: {
      value: `Small-shop vouchers ¥${yen(resident.local)} (small and independent shops only). Any-shop vouchers ¥${yen(resident.any)} (any registered shop). Pay in the Machi Vouchers web app: choose the shop and amount, then confirm.`,
    },
    stamp_rally: {
      value: `Shared stamp rally (shared series across small shops): ${resident.rally.length} of ${program.rallyTarget} different small shops; the fifth adds ¥${yen(program.rallyBonus)} to the small-shop vouchers. Shop stamp cards (each shop's own series): ${perShop || 'none yet'}. One stamp per shop per day.`,
    },
    demo: {
      value: `${last ? `Last transaction: ${last.message} Check it on Suiscan: https://suiscan.xyz/testnet/tx/${last.digest} . ` : ''}Backed by Sui testnet. This card is the Sui address ${resident.address} in program ${ids().program}. Check the balance on Suiscan: https://suiscan.xyz/testnet/account/${resident.address} . Demo yen, no real money.`,
    },
    barcode: { enabled: true, type: 'qr', source: 'custom', value: resident.address, displayText: false },
  };
  return { extId, pass, resident };
}

function downloadUrl(json: Record<string, unknown>) {
  const data = json.data as { id?: string; attributes?: { downloadUrl?: string } } | undefined;
  const url = data?.attributes?.downloadUrl;
  if (typeof url !== 'string' || !url.startsWith('https://'))
    throw new AppError('The wallet pass service did not return a download link.', 502);
  return url;
}

/** Creates Yuki's pass once, or refreshes it, and returns the link that adds it to a phone. */
export async function ensurePass() {
  if (!passEnabled()) throw new AppError('Wallet passes are not set up on this server.', 503);
  const { extId, pass } = await current();
  const existing = await call(`/passes/${extId}`);
  let url: string;
  if (existing.status === 200) {
    const updated = await call(`/passes/${extId}`, 'PATCH', { pass });
    if (updated.status >= 300) throw new AppError(`Wallet pass update failed (${updated.status}).`, 502);
    url = downloadUrl(existing.json);
  } else {
    const template = encodeURIComponent(process.env.PASSENTRY_TEMPLATE_ID!);
    const created = await call(`/passes?passTemplate=${template}&extId=${extId}`, 'POST', { pass });
    if (created.status >= 300)
      throw new AppError(
        `Wallet pass creation failed (${created.status}): ${JSON.stringify(created.json).slice(0, 200)}`,
        502,
      );
    url = downloadUrl(created.json);
  }
  return { downloadUrl: url };
}

/** After a payment, stamp or bonus: update the pass if Yuki has one. Never blocks the action. */
export async function refreshPass(last?: LastTransaction) {
  if (!passEnabled()) return;
  const message = last?.message;
  try {
    const { extId, pass } = await current(last);
    const existing = await call(`/passes/${extId}`);
    if (existing.status !== 200) return;
    await call(`/passes/${extId}`, 'PATCH', {
      pass,
      ...(message && message.length >= 5 ? { message: message.slice(0, 350) } : {}),
    });
  } catch {
    // The in-app card reads Sui directly; a stale pass is never on the critical path.
  }
}
