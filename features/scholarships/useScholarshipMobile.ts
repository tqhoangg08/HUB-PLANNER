import { useEffect, useState } from 'react';

export function useScholarshipMobile() {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width:780px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width:780px)');
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}
