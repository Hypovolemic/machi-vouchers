import { Suspense } from 'react';
import { PayView } from '@/features/resident';

export default function Page() {
  return (
    <Suspense>
      <PayView />
    </Suspense>
  );
}
