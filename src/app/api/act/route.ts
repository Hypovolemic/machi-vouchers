import { AppError, buySet, claimBonus, pay, stamp, tryTransfer, type ActionResult } from '@/lib/server/chain';
import { refreshPass } from '@/lib/server/pass';

// A light limit per visitor on this server instance: the demo accounts' test SUI is shared.
const hits = new Map<string, number[]>();
function limit(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 30) throw new AppError('Too many actions from here. Try again in a few minutes.', 429);
  hits.set(ip, [...recent, now]);
}

async function perform(body: Record<string, unknown>): Promise<ActionResult> {
  switch (body.action) {
    case 'pay':
      return pay(String(body.shop), Number(body.amount), body.voucher === 'any' ? 'any' : 'local');
    case 'stamp':
      return stamp(String(body.shop));
    case 'claim':
      return claimBonus();
    case 'transfer':
      return tryTransfer();
    case 'buy':
      return buySet();
    default:
      throw new AppError('Unknown action.');
  }
}

export async function POST(request: Request) {
  try {
    limit(request.headers.get('x-forwarded-for')?.split(',')[0] || 'local');
    const body = (await request.json()) as Record<string, unknown>;
    const result = await perform(body);
    // Payments, stamps and bonuses change what the wallet pass shows.
    if (result.ok && body.action !== 'transfer') await refreshPass(result.message);
    return Response.json(result);
  } catch (e) {
    const status = e instanceof AppError ? e.status : 502;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
