package com.evemarket.backend.dto;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Data
@NoArgsConstructor
public class CapitalContractItemDto {
    private Integer typeId;
    private String typeName;
    private Integer quantity;
    private Boolean isCapital;
    private BigDecimal estimatedValue;
}
