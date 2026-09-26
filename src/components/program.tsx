'use client';
import { useCallback, useEffect, useState } from 'react';

export type ShopView = {
  id: string;
  name: string;
  ja: string;
  tier: 'small' | 'chain';
  area: string;
  type: string;
  address: string;
  takings: number;
};
export type ChainEvent = {
  type: string;
  digest: string;
  shop?: string;
  amount?: number;
  local?: boolean;
  resident?: string;
};
export type State = {
  packageId: string;
  programId: string;
  program: {
    price: number;
    face: number;
    localShareBps: number;
    maxSets: number;
    setsSold: number;
    rallyTarget: number;
    rallyBonus: number;
    bonusesLeft: number;
    saleEnd: number;
    useEnd: number;
    requiredFunding: number;
    funded: number;
    closed: boolean;
    vault: number;
    mintedLocal: number;
    mintedAny: number;
  };
  resident: {
    address: string;
    local: number;
    any: number;
    stamps: number;
    rally: string[];
    bonusTickets: number;
    stampedToday: string[];
    /** Each shop's own stamp series: how many stamps Yuki has at that shop. */
    shopStamps: Record<string, number>;
  };
  shops: ShopView[];
  events: ChainEvent[];
  passEnabled: boolean;
};
export type ActionResult = { ok: boolean; digest: string; message: string; refusedBy?: string };

export const yen = (v: number) => `¥${v.toLocaleString('en-US')}`;
export const date = (ms: number) =>
  new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Tokyo' });
export const txUrl = (digest: string) => `https://suiscan.xyz/testnet/tx/${digest}`;
export const objectUrl = (id: string) => `https://suiscan.xyz/testnet/object/${id}`;
export const accountUrl = (id: string) => `https://suiscan.xyz/testnet/account/${id}`;
export const short = (id: string) => `${id.slice(0, 6)}…${id.slice(-4)}`;

/** Reads the program from Sui (through the server) and runs demo actions. */
export function useProgram(refreshMs = 15_000) {
  const [data, setData] = useState<State | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/state', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not read Sui testnet.');
      setData(json);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    // Polling keeps every open screen in step with the chain (payments made in another tab).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(load, refreshMs);
    return () => clearInterval(timer);
  }, [load, refreshMs]);
  const act = useCallback(
    async (body: Record<string, unknown>): Promise<ActionResult> => {
      const res = await fetch('/api/act', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong.');
      await load();
      return json;
    },
    [load],
  );
  return { data, error, act, reload: load };
}

export function Result({ result, error }: { result?: ActionResult | null; error?: string }) {
  if (error) return <div className="notice refused">{error}</div>;
  if (!result) return null;
  return (
    <div className={`notice ${result.ok ? '' : 'refused'}`} role="status">
      <strong>{result.ok ? result.message : `Refused. ${result.message}`}</strong>
      {result.refusedBy && <small>{result.refusedBy}</small>}
      {result.digest && (
        <small>
          <a href={txUrl(result.digest)} target="_blank" rel="noreferrer">
            View this transaction on Sui ({short(result.digest)}) ↗
          </a>
        </small>
      )}
    </div>
  );
}

export function Loading({ error }: { error: string }) {
  return error ? (
    <div className="notice refused">{error}</div>
  ) : (
    <p className="muted">Reading Sui testnet…</p>
  );
}
