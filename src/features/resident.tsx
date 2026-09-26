'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Loading,
  Result,
  accountUrl,
  date,
  short,
  txUrl,
  useProgram,
  yen,
  type ActionResult,
} from '@/components/program';

function useAction(act: (body: Record<string, unknown>) => Promise<ActionResult>) {
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState('');
  const run = async (name: string, body: Record<string, unknown>) => {
    setBusy(name);
    setResult(null);
    setError('');
    try {
      setResult(await act(body));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return { busy, result, error, run };
}

/** /r: Yuki's card, read from Sui. */
export function CardView() {
  const { data, error, act } = useProgram();
  const { busy, result, error: failure, run } = useAction(act);
  if (!data) return <Loading error={error} />;
  const { resident: r, program: p, shops } = data;
  const name = (id: string) => shops.find((s) => s.id === id)?.name || 'a shop';
  return (
    <>
      <h1>Yuki&apos;s vouchers</h1>
      <p className="lead">
        Yuki is a demo resident of Demo City. Balances and stamps are read from Sui testnet.
      </p>

      <div className="grid">
        <div className="card balance small">
          <span>
            Small shops <span className="ja">中小店舗券</span>
          </span>
          <strong className="num">{yen(r.local)}</strong>
          <span className="muted">Only at small and independent shops</span>
        </div>
        <div className="card balance">
          <span>
            Any shop <span className="ja">共通券</span>
          </span>
          <strong className="num">{yen(r.any)}</strong>
          <span className="muted">At any registered shop, including supermarkets</span>
        </div>
      </div>
      <p className="muted">
        Valid until {date(p.useEnd)}. Not valid for tobacco, gift cards, bills or online purchases.{' '}
        <Link href="/r/shops">Where can I use these?</Link>
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <Link className="button big" href="/r/pay">
          Pay at a shop
        </Link>
      </div>

      <div className="grid">
        <div className="card">
          <span className="chip series">Shared series · across small shops</span>
          <h2>
            Shared stamp rally <span className="ja">スタンプラリー</span>
          </h2>
          <div className="stamps" aria-label={`${r.rally.length} of ${p.rallyTarget} shops`}>
            {Array.from({ length: p.rallyTarget }, (_, i) => (
              <span key={i} className={`hanko ${r.rally[i] ? 'on' : ''}`}>
                {r.rally[i] ? name(r.rally[i]).split(' ')[0] : i === p.rallyTarget - 1 ? '¥500' : ''}
              </span>
            ))}
          </div>
          <p className="muted">
            {r.rally.length} of {p.rallyTarget} different small shops. Stamps from different small
            shops add up here; the fifth adds {yen(p.rallyBonus)} to the small-shop vouchers. Chain
            stores don&apos;t count.
          </p>
          {r.bonusTickets > 0 && (
            <button className="button" disabled={!!busy} onClick={() => run('claim', { action: 'claim' })}>
              {busy === 'claim' ? 'Collecting…' : `Collect the ${yen(p.rallyBonus)} bonus`}
            </button>
          )}
        </div>
        <div className="card">
          <h2>Card for stamps</h2>
          <div className="qr">
            <QRCodeSVG value={r.address} size={148} />
          </div>
          <p className="muted">
            Shops scan this to give a stamp. It identifies the card; it can&apos;t pay.{' '}
            <a href={accountUrl(r.address)} target="_blank" rel="noreferrer">
              {short(r.address)} on Sui ↗
            </a>
          </p>
        </div>
      </div>

      <div className="card">
        <span className="chip">Individual series · one card per shop</span>
        <h2>
          Shop stamp cards <span className="ja">お店のスタンプカード</span>
        </h2>
        <p className="muted">
          Each shop&apos;s own card counts only that shop&apos;s stamps, for shops that run their own
          rewards. A stamp at a small shop counts on its own card and in the shared rally; a chain
          store&apos;s stamps stay on its own card. Counted from the stamp records on Sui.
        </p>
        <div className="shop-cards">
          {shops.map((s) => {
            const count = r.shopStamps[s.id] || 0;
            return (
              <div key={s.id} className="shop-card">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{s.name}</strong>
                  <span className="num">{count} {count === 1 ? 'stamp' : 'stamps'}</span>
                </div>
                <div className="mini-stamps" aria-hidden="true">
                  {Array.from({ length: Math.max(count, 5) }, (_, i) => (
                    <span key={i} className={`mini-hanko ${i < count ? 'on' : ''}`} />
                  ))}
                </div>
                <small className="muted">
                  {s.tier === 'small' ? 'Also counts toward the shared rally' : 'This shop only (chain store)'}
                  {r.stampedToday.includes(s.id) ? ' · stamped today' : ''}
                </small>
              </div>
            );
          })}
        </div>
      </div>

      {data.passEnabled && <WalletPass />}

      <div className="card">
        <h2>Try it as Yuki</h2>
        <ol className="steps">
          <li>
            <Link href="/r/pay?shop=ramen&amount=1200&voucher=local">
              Pay Ramen Taro ¥1,200 with small-shop vouchers
            </Link>
          </li>
          <li>
            <Link href="/s/stamp?shop=bakery">Get a stamp at Komugi Bakery</Link>
          </li>
          <li>
            <Link href="/r/pay?shop=market&amount=800&voucher=local">
              Try small-shop vouchers at Everyday Market, a supermarket chain
            </Link>
          </li>
          <li>
            <button
              className="button outline"
              disabled={!!busy}
              onClick={() => run('transfer', { action: 'transfer' })}
            >
              {busy === 'transfer' ? 'Trying…' : 'Try to send ¥100 of vouchers to a friend'}
            </button>
          </li>
          <li>
            <Link href="/admin">See what the city sees</Link>
          </li>
        </ol>
        <Result result={result} error={failure} />
      </div>

      <Activity />

      <button className="button outline" disabled={!!busy} onClick={() => run('buy', { action: 'buy' })}>
        {busy === 'buy' ? 'Buying…' : `Buy another set: pay ${yen(p.price)}, get ${yen(p.face)}`}
      </button>
    </>
  );
}

const activityLabel: Record<string, string> = {
  Paid: 'Paid',
  Stamped: 'Stamp',
  BonusIssued: 'Rally bonus earned',
  BonusClaimed: 'Bonus collected',
  Purchased: 'Bought a set',
};

/** Yuki's recent onchain activity, each line linked to its transaction. */
function Activity() {
  const { data } = useProgram();
  if (!data) return null;
  const mine = data.events.filter((e) => e.resident === data.resident.address && activityLabel[e.type]);
  const name = (id?: string) => data.shops.find((s) => s.id === id)?.name || '';
  return (
    <div className="card">
      <h2>Yuki&apos;s recent activity</h2>
      {mine.length ? (
        <table>
          <tbody>
            {mine.slice(0, 12).map((e) => (
              <tr key={`${e.digest}-${e.type}`}>
                <td>{activityLabel[e.type]}</td>
                <td>{name(e.shop)}</td>
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
      ) : (
        <p className="muted">Payments, stamps and bonuses appear here with their Sui transactions.</p>
      )}
    </div>
  );
}

/** Adds Yuki's card to Apple Wallet or Google Wallet through PassEntry. */
function WalletPass() {
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const get = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/pass', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'The wallet pass is not available right now.');
      setUrl(json.downloadUrl);
      window.open(json.downloadUrl, '_blank', 'noopener');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h2>Put the card in your phone</h2>
      <p className="muted">
        The pass shows Yuki&apos;s balances and stamps from Sui and updates after every payment and
        stamp. Its QR is Yuki&apos;s Sui address, the same as the card above. It identifies the card; it
        can&apos;t pay.
      </p>
      <div className="row">
        {url ? (
          <a className="button indigo" href={url} target="_blank" rel="noreferrer">
            Open the pass: Apple Wallet or Google Wallet
          </a>
        ) : (
          <button className="button indigo" disabled={busy} onClick={get}>
            {busy ? 'Preparing the pass…' : 'Add to Apple Wallet or Google Wallet'}
          </button>
        )}
      </div>
      <p className="muted">Issued with a PassEntry trial, so the pass carries a trial watermark.</p>
      {error && <div className="notice refused">{error}</div>}
    </div>
  );
}

/** /r/pay: choose a shop, an amount and which vouchers to use. */
export function PayView() {
  const params = useSearchParams();
  const { data, error, act } = useProgram();
  const [shop, setShop] = useState(params.get('shop') || '');
  const [amount, setAmount] = useState(params.get('amount') || '');
  const [voucher, setVoucher] = useState<'local' | 'any'>(params.get('voucher') === 'any' ? 'any' : 'local');
  const { busy, result, error: failure, run } = useAction(act);
  if (!data) return <Loading error={error} />;
  const chosen = data.shops.find((s) => s.id === shop);
  const value = Number(amount);
  return (
    <>
      <h1>Pay at a shop</h1>
      <p className="lead">The shop is paid in the same transaction that spends the vouchers.</p>

      <div className="card">
        <h2>1. Shop</h2>
        <div className="choice">
          {data.shops.map((s) => (
            <button key={s.id} className={shop === s.id ? 'on' : ''} onClick={() => setShop(s.id)}>
              {s.name} <span className={`chip ${s.tier === 'small' ? 'small' : ''}`}>{s.tier === 'small' ? 'small shop' : 'chain'}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>2. Amount and vouchers</h2>
        <label className="field">
          Amount (¥)
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="1200"
          />
        </label>
        <div className="choice">
          <button className={`${voucher === 'local' ? 'on small' : ''}`} onClick={() => setVoucher('local')}>
            Small-shop vouchers · {yen(data.resident.local)}
          </button>
          <button className={voucher === 'any' ? 'on' : ''} onClick={() => setVoucher('any')}>
            Any-shop vouchers · {yen(data.resident.any)}
          </button>
        </div>
        {chosen?.tier === 'chain' && voucher === 'local' && (
          <p className="muted">
            {chosen.name} is a chain store. The contract will refuse small-shop vouchers here; try it.
          </p>
        )}
      </div>

      <button
        className="button big"
        disabled={!chosen || !value || !!busy}
        onClick={() => run('pay', { action: 'pay', shop, amount: value, voucher })}
      >
        {busy ? 'Paying on Sui…' : chosen && value ? `Pay ${yen(value)} to ${chosen.name}` : 'Choose a shop and amount'}
      </button>
      <Result result={result} error={failure} />
      {result?.ok && (
        <p>
          <Link href="/r">Back to Yuki&apos;s card</Link> · <Link href={`/s?shop=${shop}`}>See the shop&apos;s screen</Link>
        </p>
      )}
    </>
  );
}

/** /r/shops: where the vouchers work. */
export function ShopsView() {
  const { data, error } = useProgram();
  if (!data) return <Loading error={error} />;
  return (
    <>
      <h1>Where can I use these?</h1>
      <p className="lead">
        Every registered shop in Demo City. Small-shop vouchers work only at small and independent
        shops; any-shop vouchers work at all of them.
      </p>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Shop</th>
              <th>Area</th>
              <th>Type</th>
              <th>Accepts</th>
            </tr>
          </thead>
          <tbody>
            {data.shops.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.name} <span className="ja">{s.ja}</span>
                </td>
                <td>{s.area}</td>
                <td>{s.type}</td>
                <td>{s.tier === 'small' ? 'Small-shop and any-shop' : 'Any-shop only'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
