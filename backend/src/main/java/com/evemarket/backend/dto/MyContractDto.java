package com.evemarket.backend.dto;

import lombok.Data;
import java.math.BigDecimal;

@Data
public class MyContractDto {
    private long       contractId;
    private String     type;
    private String     status;
    private String     title;
    private String     availability;
    private boolean    forCorporation;
    private long       issuerId;
    private long       issuerCorporationId;
    private long       assigneeId;
    private long       acceptorId;
    private long       startLocationId;
    private String     startLocationName;
    private long       endLocationId;
    private String     endLocationName;
    private BigDecimal price;
    private BigDecimal reward;
    private BigDecimal collateral;
    private double     volume;
    private String     dateIssued;
    private String     dateExpired;
    private String     dateAccepted;
    private String     dateCompleted;
    private String     source;   // "Character" or "Corporation"
}
