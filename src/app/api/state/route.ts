import { AppError, ids, readEvents, readProgram, readResident, readShops } from '@/lib/server/chain';
import { passEnabled } from '@/lib/server/pass';

export async function GET() {
  try {
    const program = await readProgram();
    const [resident, shops, events] = await Promise.all([
      readResident(program),
      readShops(),
      readEvents(),
    ]);
    const publicProgram: Partial<typeof program> = { ...program };
    delete publicProgram.cardsTable;
    delete publicProgram.lastStampTable;
    return Response.json(
      {
        packageId: ids().pkg,
        programId: ids().program,
        program: publicProgram,
        resident,
        shops,
        events,
        passEnabled: passEnabled(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const status = e instanceof AppError ? e.status : 502;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
