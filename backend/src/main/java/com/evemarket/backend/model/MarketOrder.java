package com.evemarket.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "market_orders", indexes = {
        @Index(name = "idx_type_id", columnList = "type_id"),
        @Index(name = "idx_region_id", columnList = "region_id"),
        @Index(name = "idx_discovered_at", columnList = "discovered_at"),
        @Index(name = "idx_arbitrage", columnList = "is_buy_order, type_id, region_id, price")
})
@Data
@NoArgsConstructor
public class MarketOrder {

    @Id
    @Column(name = "order_id")
    private Long orderId;

    @Column(name = "type_id", nullable = false)
    private Integer typeId;

    @Column(name = "type_name")
    private String typeName;

    @Column(name = "region_id", nullable = false)
    private Integer regionId;

    @Column(name = "location_id", nullable = false)
    private Long locationId;

    @Column(name = "system_id")
    private Long systemId;

    @Column(name = "system_name")
    private String systemName;

    @Column(nullable = false, precision = 20, scale = 2)
    private BigDecimal price;

    @Column(name = "average_price", precision = 20, scale = 2)
    private BigDecimal averagePrice;

    @Column(name = "discount_percent")
    private Double discountPercent;

    @Column(name = "volume_total")
    private Integer volumeTotal;

    @Column(name = "volume_remain")
    private Integer volumeRemain;

    @Column(name = "is_buy_order", nullable = false)
    private Boolean isBuyOrder;

    @Column(length = 20)
    private String range;

    private Instant issued;

    @Column(name = "discovered_at", nullable = false)
    private Instant discoveredAt;

    @Column(name = "is_good_deal", nullable = false)
    private Boolean isGoodDeal = false;
}
