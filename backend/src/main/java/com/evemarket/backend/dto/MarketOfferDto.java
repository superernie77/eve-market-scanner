package com.evemarket.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;

@Data
public class MarketOfferDto {
    private Long orderId;
    private Integer typeId;
    private String typeName;
    private Long locationId;
    private Long systemId;
    private String systemName;
    private BigDecimal price;
    private BigDecimal averagePrice;
    private Double discountPercent;
    private Integer volumeRemain;
    private Boolean isBuyOrder;
    private String range;
    private Instant issued;
    private Instant discoveredAt;
}
