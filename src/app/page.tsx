import Link from 'next/link';

export default function Home() {
  return (
    <>
      <h1>Local vouchers that only work on the shopping street.</h1>
      <p className="lead">
        A chamber of commerce issues premium vouchers on Sui: pay ¥10,000, get ¥12,000 to spend at
        local shops. The shop is paid in the same transaction as the resident pays, staff add a stamp
        with one tap, and the city can check every yen. Try it from three sides:
      </p>
      <div className="grid">
        <Link href="/r" className="card">
          <h2>Resident</h2>
          <p className="muted">Yuki&apos;s vouchers and stamp card. Pay a shop, collect a bonus.</p>
        </Link>
        <Link href="/s" className="card">
          <h2>Shop counter</h2>
          <p className="muted">See money arrive the moment Yuki pays. Give a stamp: +1, confirm.</p>
        </Link>
        <Link href="/admin" className="card">
          <h2>City dashboard</h2>
          <p className="muted">Where the subsidy went, which shops need a visit, every event.</p>
        </Link>
      </div>
      <p className="muted">
        Everything runs on Sui testnet with demo accounts that this server signs for, so you don&apos;t
        need a wallet. Demo yen (dJPY) only; no real money.
      </p>
    </>
  );
}
