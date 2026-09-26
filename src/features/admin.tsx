'use client';
import { Loading, date, objectUrl, short, txUrl, useProgram, yen } from '@/components/program';

const labels: Record<string, string> = {
  Paid: 'Payment',
  Stamped: 'Stamp',
  BonusIssued: 'Rally bonus',
  BonusClaimed: 'Bonus collected',
  Purchased: 'Set bought',
  Funded: 'Subsidy deposited',
  ShopRegistered: 'Shop registered',
  ShopStatusChanged: 'Shop paused / resumed',
  ProgramLaunched: 'Program launched',
  ProgramClosed: 'Program closed',
};

/** /admin: the chamber's and the city's view of the program, read from Sui. */
export function DashboardView() {
  const { data, error } = useProgram();
  if (!data) return <Loading error={error} />;
  const { program: p, shops, events } = data;
  const spent = shops.reduce((s, x) => s + x.takings, 0);
  const small = shops.filter((s) => s.tier === 'small').reduce((s, x) => s + x.takings, 0);
  const issued = p.mintedLocal + p.mintedAny;
  const stampsBy = (id: string) => events.filter((e) => e.type === 'Stamped' && e.shop === id).length;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  const quiet = shops.filter((s) => s.takings === 0);
  return (
    <>
      <h1>City dashboard</h1>
      <p className="lead">
        Machi Autumn Voucher · Demo City · read from the program on Sui testnet{' '}
        <a href={objectUrl(data.programId)} target="_blank" rel="noreferrer">
          {short(data.programId)} ↗
        </a>
      </p>

      <h2>Understand</h2>
      <div className="grid">
        <div className="card kpi">
          <small>Subsidy deposited</small>
          <strong className="num">{yen(p.funded)}</strong>
          <small>
            of {yen(p.requiredFunding)} needed ({pct(p.funded, p.requiredFunding)}%) for premiums and
            rally bonuses
          </small>
        </div>
        <div className="card kpi">
          <small>Voucher sets sold</small>
          <strong className="num">
            {p.setsSold} / {p.maxSets}
          </strong>
          <small>
            {yen(p.price)} buys {yen(p.face)} · sales close {date(p.saleEnd)}
          </small>
        </div>
        <div className="card kpi">
          <small>Vouchers spent</small>
          <strong className="num">{yen(spent)}</strong>
          <small>
            of {yen(issued)} issued ({pct(spent, issued)}%) · {pct(small, spent)}% at small shops
          </small>
        </div>
        <div className="card kpi">
          <small>Program vault</small>
          <strong className="num">{yen(p.vault)}</strong>
          <small>Backs every unspent voucher · {p.bonusesLeft} rally bonuses left</small>
        </div>
      </div>

      <h2>Act</h2>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Shop</th>
              <th>Type</th>
              <th>Area</th>
              <th className="right">Received</th>
              <th className="right">Stamps (recent)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[...shops]
              .sort((a, b) => b.takings - a.takings)
              .map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>
                    <span className={`chip ${s.tier === 'small' ? 'small' : ''}`}>
                      {s.tier === 'small' ? 'small shop' : 'chain'}
                    </span>
                  </td>
                  <td>{s.area}</td>
                  <td className="right num">{yen(s.takings)}</td>
                  <td className="right num">{stampsBy(s.id)}</td>
                  <td>
                    {s.takings === 0 ? <span className="chip flag">No takings yet: call them</span> : 'Active'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {quiet.length > 0 && (
          <p className="muted">
            {quiet.length} {quiet.length === 1 ? 'shop has' : 'shops have'} no voucher takings yet.
            That&apos;s who the chamber should visit this week.
          </p>
        )}
      </div>

      <h2>Check</h2>
      <div className="card table-wrap">
        <p className="muted">Every figure above comes from these onchain events. Open any one on Suiscan.</p>
        <table>
          <tbody>
            {events.map((e) => (
              <tr key={`${e.digest}-${e.type}-${e.shop}`}>
                <td>{labels[e.type] || e.type}</td>
                <td>{e.shop ? shops.find((s) => s.id === e.shop)?.name || short(e.shop) : ''}</td>
                <td className="right num">{e.amount !== undefined ? yen(e.amount) : ''}</td>
                <td className="right">
                  <a href={txUrl(e.digest)} target="_blank" rel="noreferrer">
                    {short(e.digest)} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
