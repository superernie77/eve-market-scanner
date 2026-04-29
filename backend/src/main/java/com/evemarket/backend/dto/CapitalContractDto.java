package com.evemarket.backend.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

@Data
@NoArgsConstructor
public class CapitalContractDto {

    private Long contractId;
    private Integer regionId;
    private String regionName;
    private Long issuerId;
    private Long startLocationId;
    private String startLocationName;
    private BigDecimal price;
    private Instant dateIssued;
    private Instant dateExpired;
    private String title;

    // Capital summary
    private Integer capitalTypeId;
    private String capitalTypeName;
    private String capitalGroupName;
    private Integer capitalQuantity;
    private Boolean hasMixedCapitals;

    // Pricing breakdown
    private BigDecimal nonCapItemValue;
    private BigDecimal effectiveCapitalPrice;
    private BigDecimal effectivePricePerUnit;
    private Boolean priceIncomplete;
    private Integer unknownPriceItemCount;

    private List<CapitalContractItemDto> items;
}
