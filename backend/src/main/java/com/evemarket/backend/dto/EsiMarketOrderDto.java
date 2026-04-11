package com.evemarket.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;

@Data
public class EsiMarketOrderDto {

    @JsonProperty("order_id")
    private Long orderId;

    @JsonProperty("type_id")
    private Integer typeId;

    @JsonProperty("location_id")
    private Long locationId;

    @JsonProperty("volume_total")
    private Integer volumeTotal;

    @JsonProperty("volume_remain")
    private Integer volumeRemain;

    @JsonProperty("min_volume")
    private Integer minVolume;

    private BigDecimal price;

    @JsonProperty("is_buy_order")
    private Boolean isBuyOrder;

    private Integer duration;

    private Instant issued;

    private String range;

    @JsonProperty("system_id")
    private Long systemId;
}
