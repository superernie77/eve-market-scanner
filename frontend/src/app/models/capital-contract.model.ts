export interface CapitalContractItem {
  typeId: number;
  typeName: string;
  quantity: number;
  isCapital: boolean;
  isRig: boolean;
  packagedVolume: number | null;
  estimatedValue: number | null;
}

export interface CapitalContract {
  contractId: number;
  regionId: number;
  regionName: string;
  issuerId: number;
  startLocationId: number;
  startLocationName: string;
  startSystemName: string | null;
  itemCount: number | null;
  volume: number | null;
  price: number;
  dateIssued: string;
  dateExpired: string;
  title: string;

  capitalTypeId: number | null;
  capitalTypeName: string | null;
  capitalGroupName: string | null;
  capitalQuantity: number | null;
  hasMixedCapitals: boolean | null;

  nonCapItemValue: number;
  effectiveCapitalPrice: number;
  effectivePricePerUnit: number;
  priceIncomplete: boolean;
  unknownPriceItemCount: number;

  totalItemValue: number | null;
  valueDiff: number | null;
  valueDiffPct: number | null;
  totalValueIncomplete: boolean;

  items: CapitalContractItem[];
}

export interface CapitalTypeOption {
  typeId: number;
  typeName: string;
}

export interface CapitalContractFilter {
  regionId?: number | null;
  capitalTypeId?: number | null;
  capitalGroupName?: string | null;
  maxPrice?: number | null;
  priceCompleteOnly?: boolean;
  noFittings?: boolean;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
}

export interface ContractDealFilter {
  regionId?: number | null;
  minContractValue?: number | null;
  minAbsDiff?: number | null;
  minPctDiff?: number;
  page?: number;
  size?: number;
  sortBy?: string;
  sortDir?: string;
}

// Spring Boot 3.x nests pagination metadata under a "page" sub-object
export interface CapitalContractPage {
  content: CapitalContract[];
  page: {
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
  };
}
