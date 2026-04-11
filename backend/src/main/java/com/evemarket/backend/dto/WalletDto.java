package com.evemarket.backend.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class WalletDto {

    private BigDecimal characterBalance;
    private List<CorpDivisionDto> corpDivisions;

    @Data
    public static class CorpDivisionDto {
        private int division;
        private BigDecimal balance;
    }
}
