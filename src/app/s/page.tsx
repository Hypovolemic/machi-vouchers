import { Suspense } from 'react';
import { CounterView } from '@/features/staff';

export default function Page() {
  return (
    <Suspense>
      <CounterView />
    </Suspense>
  );
}
