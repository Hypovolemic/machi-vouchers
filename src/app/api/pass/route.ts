import { AppError } from '@/lib/server/chain';
import { ensurePass } from '@/lib/server/pass';

export async function POST() {
  try {
    return Response.json(await ensurePass());
  } catch (e) {
    const status = e instanceof AppError ? e.status : 502;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
