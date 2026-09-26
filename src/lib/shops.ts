// Fictional demo shops for the demo city. Area and type are app metadata; the contract only
// stores each shop's name and tier (small or chain).
export type Shop = {
  id: string;
  name: string;
  ja: string;
  tier: 'small' | 'chain';
  area: string;
  type: 'Food' | 'Shopping' | 'Services';
};

export const SHOPS: Shop[] = [
  { id: 'ramen', name: 'Ramen Taro', ja: 'ラーメン太郎', tier: 'small', area: 'Koenji', type: 'Food' },
  { id: 'bakery', name: 'Komugi Bakery', ja: 'こむぎベーカリー', tier: 'small', area: 'Asagaya', type: 'Food' },
  { id: 'tea', name: 'Midori Tea House', ja: 'みどり茶房', tier: 'small', area: 'Ogikubo', type: 'Food' },
  { id: 'flowers', name: 'Hana Florist', ja: 'はな花店', tier: 'small', area: 'Koenji', type: 'Shopping' },
  { id: 'books', name: 'Machi Books', ja: 'まち書店', tier: 'small', area: 'Asagaya', type: 'Shopping' },
  { id: 'market', name: 'Everyday Market', ja: 'エブリデイマーケット', tier: 'chain', area: 'Ogikubo', type: 'Shopping' },
];

export const shopById = (id: string) => SHOPS.find((s) => s.id === id);
