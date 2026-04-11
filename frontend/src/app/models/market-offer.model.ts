export interface MarketOffer {
  orderId: number;
  typeId: number;
  typeName: string;
  locationId: number;
  systemId: number | null;
  systemName: string | null;
  price: number;
  averagePrice: number | null;
  discountPercent: number | null;
  volumeRemain: number;
  isBuyOrder: boolean;
  range: string;
  issued: string;
  discoveredAt: string;
}

export interface Page<T> {
  content: T[];
  page: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}

export interface MarketStats {
  totalOrders: number;
  goodDeals: number;
  regionId: number;
}

export interface ArbitrageOpportunity {
  typeId: number;
  typeName: string;
  buyRegionId: number;
  buyRegionName: string;
  buyPrice: number;
  sellRegionId: number;
  sellRegionName: string;
  sellPrice: number;
  gapPercent: number;
  volumeAvailable: number;
  averagePrice: number | null;
  alreadyListed: boolean;
}

export interface MyOrder {
  orderId: number;
  typeId: number;
  typeName: string;
  regionId: number;
  regionName: string;
  locationId: number;
  volumeTotal: number;
  volumeRemain: number;
  price: number;
  issued: string;
  duration: number;
  range: string | null;
  source: 'Character' | 'Corporation';
}

export interface CorpTransaction {
  transactionId: number;
  date: string;
  typeId: number;
  typeName: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  isBuy: boolean;
  isPersonal: boolean;
  clientId: number;
  locationId: number;
  locationName: string;
  division: number;
}

export interface CorpDivision {
  division: number;
  balance: number;
}

export interface WalletData {
  characterBalance: number | null;
  corpDivisions: CorpDivision[];
}

export interface Favourite {
  typeId: number;
  typeName: string;
}

export interface ArbitrageFilter {
  minAveragePrice?: number | null;
  maxAveragePrice?: number | null;
  typeName?: string | null;
  categoryName?: string | null;
  minGapPercent?: number;
  limit?: number;
  typeIds?: number[];
}
