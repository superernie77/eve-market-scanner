package com.evemarket.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Data
@NoArgsConstructor
public class EsiContractDto {

    @JsonProperty("contract_id")
    private Long contractId;

    @JsonProperty("issuer_id")
    private Long issuerId;

    @JsonProperty("issuer_corporation_id")
    private Long issuerCorporationId;

    @JsonProperty("type")
    private String type;

    @JsonProperty("start_location_id")
    private Long startLocationId;

    @JsonProperty("price")
    private BigDecimal price;

    @JsonProperty("buyout")
    private BigDecimal buyout;

    @JsonProperty("date_issued")
    private Instant dateIssued;

    @JsonProperty("date_expired")
    private Instant dateExpired;

    @JsonProperty("title")
    private String title;

    @JsonProperty("for_corporation")
    private Boolean forCorporation;

    @JsonProperty("availability")
    private String availability;
}
