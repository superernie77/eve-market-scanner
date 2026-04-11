package com.evemarket.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class TransactionDto {
    private long       transactionId;
    private String     date;
    private int        typeId;
    private String     typeName;
    private int        quantity;
    private BigDecimal unitPrice;
    private BigDecimal totalValue;
    @JsonProperty("isBuy")
    private boolean    isBuy;
    @JsonProperty("isPersonal")
    private boolean    isPersonal;
    private long       clientId;
    private long       locationId;
    private String     locationName;
    private int        division;
}
