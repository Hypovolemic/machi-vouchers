import { Suspense } from 'react';
import { StampView } from '@/features/staff';

export default function Page() {
  return (
    <Suspense>
      <StampView />
    </Suspense>
  );
}
