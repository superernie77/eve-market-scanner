package com.evemarket.backend.dto;

import lombok.Data;

@Data
public class MyContractItemDto {
    private int     typeId;
    private String  typeName;
    private int     quantity;
    private boolean included;
    private boolean singleton;
}
