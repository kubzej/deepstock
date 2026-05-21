export type StockDetailBackTo = '/' | '/stocks' | '/watchlist' | '/research';

export interface StockDetailBackState {
  to: StockDetailBackTo;
  label?: string;
}

export function withStockDetailBack(back: StockDetailBackState) {
  return <TState extends object>(prev: TState) => ({
    ...prev,
    stockDetailBack: back,
  });
}
