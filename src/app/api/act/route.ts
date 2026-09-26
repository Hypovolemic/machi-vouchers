import { AppError, buySet, claimBonus, pay, stamp, tryTransfer } from '@/lib/server/chain';

// A light limit per visitor on this server instance: the demo accounts' test SUI is shared.
const hits = new Map<string, number[]>();
function limit(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  if (recent.length >= 30) throw new AppError('Too many actions from here. Try again in a few minutes.', 429);
  hits.set(ip, [...recent, now]);
}

export async function POST(request: Request) {
  try {
    limit(request.headers.get('x-forwarded-for')?.split(',')[0] || 'local');
    const body = (await request.json()) as Record<string, unknown>;
    switch (body.action) {
      case 'pay':
        return Response.json(
          await pay(String(body.shop), Number(body.amount), body.voucher === 'any' ? 'any' : 'local'),
        );
      case 'stamp':
        return Response.json(await stamp(String(body.shop)));
      case 'claim':
        return Response.json(await claimBonus());
      case 'transfer':
        return Response.json(await tryTransfer());
      case 'buy':
        return Response.json(await buySet());
      default:
        throw new AppError('Unknown action.');
    }
  } catch (e) {
    const status = e instanceof AppError ? e.status : 502;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
