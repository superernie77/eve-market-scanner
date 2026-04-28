export interface CapitalContractItem {
  typeId: number;
  typeName: string;
  quantity: number;
  isCapital: boolean;
  estimatedValue: number | null;
}

export interface CapitalContract {
  contractId: number;
  regionId: number;
  regionName: string;
  issuerId: number;
  price: number;
  dateIssued: string;
  dateExpired: string;
  title: string;

  capitalTypeId: number;
  capitalTypeName: string;
  capitalGroupName: string;
  capitalQuantity: number;
  hasMixedCapitals: boolean;

  nonCapItemValue: number;
  effectiveCapitalPrice: number;
  effectivePricePerUnit: number;
  priceIncomplete: boolean;
  unknownPriceItemCount: number;

  items: CapitalContractItem[];
}

export interface CapitalContractFilter {
  regionId?: number | null;
  capitalTypeId?: number | null;
  maxPrice?: number | null;
  priceCompleteOnly?: boolean;
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
