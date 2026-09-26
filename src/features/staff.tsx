'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Loading, Result, short, txUrl, useProgram, yen, type ActionResult } from '@/components/program';

function ShopPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data } = useProgram();
  if (!data) return null;
  return (
    <label className="field">
      This counter is
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {data.shops.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.tier === 'small' ? 'small shop' : 'chain'})
          </option>
        ))}
      </select>
    </label>
  );
}

/** /s: the shop's counter screen. Money arrives here the moment a resident pays. */
export function CounterView() {
  const params = useSearchParams();
  const [shopId, setShopId] = useState(params.get('shop') || 'ramen');
  // The counter refreshes quickly so a payment shows up here moments after Yuki pays.
  const { data, error } = useProgram(3_000);
  if (!data) return <Loading error={error} />;
  const shop = data.shops.find((s) => s.id === shopId) || data.shops[0];
  const paid = data.events.filter((e) => e.type === 'Paid' && e.shop === shop.id);
  return (
    <>
      <h1>{shop.name}</h1>
      <p className="lead">Shop counter · no POS needed, any phone or tablet works.</p>
      <ShopPicker value={shop.id} onChange={setShopId} />

      <div className="grid">
        <div className="card kpi">
          <small>Received in vouchers, total</small>
          <strong className="num">{yen(shop.takings)}</strong>
          <small>Paid out in demo yen (dJPY) in the same transaction as each payment</small>
        </div>
        <div className="card">
          <h2>Give a stamp</h2>
          <p className="muted">Scan the customer&apos;s card, tap +1, confirm.</p>
          <Link className="button indigo" href={`/s/stamp?shop=${shop.id}`}>
            Open stamp screen
          </Link>
        </div>
      </div>

      <div className="card">
        <h2>Just received</h2>
        {paid.length ? (
          <table>
            <tbody>
              {paid.map((e) => (
                <tr key={e.digest}>
                  <td className="num">
                    <strong>{yen(e.amount || 0)}</strong>
                  </td>
                  <td>{e.local ? 'small-shop vouchers' : 'any-shop vouchers'}</td>
                  <td className="right">
                    <a href={txUrl(e.digest)} target="_blank" rel="noreferrer">
                      {short(e.digest)} ↗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Payments appear here as they arrive. Keep this screen open.</p>
        )}
      </div>
    </>
  );
}

/** /s/stamp: staff scan the card, tap +1, then confirm. */
export function StampView() {
  const params = useSearchParams();
  const [shopId, setShopId] = useState(params.get('shop') || 'bakery');
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [failure, setFailure] = useState('');
  const { data, error, act } = useProgram();
  if (!data) return <Loading error={error} />;
  const shop = data.shops.find((s) => s.id === shopId) || data.shops[0];
  const r = data.resident;
  const done = r.stampedToday.includes(shop.id);
  const confirm = async () => {
    setBusy(true);
    setResult(null);
    setFailure('');
    try {
      setResult(await act({ action: 'stamp', shop: shop.id }));
    } catch (e) {
      setFailure((e as Error).message);
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };
  return (
    <>
      <h1>Give a stamp</h1>
      <p className="lead">{shop.name} · one stamp per customer per day, never to yourself.</p>
      <ShopPicker
        value={shop.id}
        onChange={(id) => {
          setShopId(id);
          setArmed(false);
          setResult(null);
        }}
      />

      <div className="card">
        <h2>Customer: Yuki</h2>
        <p className="muted">
          Demo card {short(r.address)}
          {done ? ' · already stamped here today' : ''}
        </p>
        <div className="grid">
          <div className="shop-card">
            <span className="chip">Individual series · {shop.name}&apos;s own card</span>
            <strong className="num">
              {r.shopStamps[shop.id] || 0} {(r.shopStamps[shop.id] || 0) === 1 ? 'stamp' : 'stamps'}
            </strong>
            <small className="muted">Counts only stamps from {shop.name}.</small>
          </div>
          <div className="shop-card">
            <span className="chip series">Shared series · stamp rally</span>
            <strong className="num">
              {r.rally.length} of {data.program.rallyTarget} small shops
            </strong>
            <small className="muted">
              {shop.tier === 'small'
                ? r.rally.includes(shop.id)
                  ? `${shop.name} is already in this round of the rally.`
                  : `A stamp here also counts toward the shared rally.`
                : 'Chain store: this stamp stays on the shop’s own card only.'}
            </small>
          </div>
        </div>
        {!armed ? (
          <button className="button big" disabled={busy} onClick={() => setArmed(true)}>
            +1 stamp
          </button>
        ) : (
          <div className="row">
            <button className="button big" disabled={busy} onClick={confirm}>
              {busy ? 'Stamping on Sui…' : 'Confirm stamp'}
            </button>
            <button className="button outline" disabled={busy} onClick={() => setArmed(false)}>
              Cancel
            </button>
          </div>
        )}
        <Result result={result} error={failure} />
        {result?.ok && r.bonusTickets > 0 && (
          <div className="notice">
            <strong>Five shops reached: Yuki has a ¥500 bonus to collect on her card.</strong>
            <small>
              <Link href="/r">Open Yuki&apos;s card</Link>
            </small>
          </div>
        )}
      </div>
    </>
  );
}
