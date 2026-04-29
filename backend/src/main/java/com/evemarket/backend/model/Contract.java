package com.evemarket.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "contracts", indexes = {
        @Index(name = "idx_contract_region",       columnList = "region_id"),
        @Index(name = "idx_contract_expired",      columnList = "date_expired"),
        @Index(name = "idx_contract_capital_type", columnList = "capital_type_id")
})
@Data
@NoArgsConstructor
public class Contract {

    @Id
    @Column(name = "contract_id")
    private Long contractId;

    @Column(name = "region_id", nullable = false)
    private Integer regionId;

    @Column(name = "issuer_id")
    private Long issuerId;

    @Column(name = "issuer_corporation_id")
    private Long issuerCorporationId;

    @Column(name = "start_location_id")
    private Long startLocationId;

    @Column(name = "start_location_name")
    private String startLocationName;

    @Column(precision = 20, scale = 2)
    private BigDecimal price;

    @Column(name = "date_issued")
    private Instant dateIssued;

    @Column(name = "date_expired")
    private Instant dateExpired;

    @Column(length = 100)
    private String title;

    @Column(name = "discovered_at", nullable = false)
    private Instant discoveredAt;

    // Capital ship summary
    @Column(name = "capital_type_id")
    private Integer capitalTypeId;

    @Column(name = "capital_type_name")
    private String capitalTypeName;

    @Column(name = "capital_group_name")
    private String capitalGroupName;

    @Column(name = "capital_quantity")
    private Integer capitalQuantity;

    @Column(name = "has_mixed_capitals")
    private Boolean hasMixedCapitals;

    // Effective price breakdown
    @Column(name = "non_cap_item_value", precision = 20, scale = 2)
    private BigDecimal nonCapItemValue;

    @Column(name = "effective_capital_price", precision = 20, scale = 2)
    private BigDecimal effectiveCapitalPrice;

    // effectiveCapitalPrice / capitalQuantity — null if hasMixedCapitals=true
    @Column(name = "effective_price_per_unit", precision = 20, scale = 2)
    private BigDecimal effectivePricePerUnit;

    @Column(name = "price_incomplete")
    private Boolean priceIncomplete;

    @Column(name = "unknown_price_item_count")
    private Integer unknownPriceItemCount;
}
