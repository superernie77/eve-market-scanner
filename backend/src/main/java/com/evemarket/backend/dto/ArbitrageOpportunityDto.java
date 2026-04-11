package com.evemarket.backend.dto;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ArbitrageOpportunityDto {
    private Integer    typeId;
    private String     typeName;
    private Integer    buyRegionId;
    private String     buyRegionName;
    private BigDecimal buyPrice;
    private Integer    sellRegionId;
    private String     sellRegionName;
    private BigDecimal sellPrice;
    private Double     gapPercent;
    private Integer    volumeAvailable;
    private BigDecimal averagePrice;
    private boolean    alreadyListed;
}
