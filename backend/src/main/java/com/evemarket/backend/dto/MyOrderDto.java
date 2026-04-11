package com.evemarket.backend.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class MyOrderDto {
    private Long       orderId;
    private Integer    typeId;
    private String     typeName;
    private Integer    regionId;
    private String     regionName;
    private Long       locationId;
    private Integer    volumeTotal;
    private Integer    volumeRemain;
    private BigDecimal price;
    private String     issued;       // ISO-8601 string from ESI
    private Integer    duration;     // days the order was placed for
    private String     range;        // buy order reach (station, solarsystem, 3, etc.)
    private String     source;       // "Character" or "Corporation"
}
