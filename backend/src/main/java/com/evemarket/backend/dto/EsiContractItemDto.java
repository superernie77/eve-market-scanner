package com.evemarket.backend.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
public class EsiContractItemDto {

    @JsonProperty("record_id")
    private Long recordId;

    @JsonProperty("type_id")
    private Integer typeId;

    @JsonProperty("quantity")
    private Integer quantity;

    @JsonProperty("is_included")
    private Boolean isIncluded;

    @JsonProperty("is_singleton")
    private Boolean isSingleton;

    @JsonProperty("item_id")
    private Long itemId;

    @JsonProperty("is_blueprint_copy")
    private Boolean isBlueprintCopy;

    @JsonProperty("raw_quantity")
    private Integer rawQuantity;
}
