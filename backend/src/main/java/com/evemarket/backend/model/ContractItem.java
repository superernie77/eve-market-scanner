package com.evemarket.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

@Entity
@Table(name = "contract_items", indexes = {
        @Index(name = "idx_ci_contract_id", columnList = "contract_id")
})
@Data
@NoArgsConstructor
public class ContractItem {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "contract_item_seq")
    @SequenceGenerator(name = "contract_item_seq", sequenceName = "contract_item_seq", allocationSize = 50)
    private Long id;

    @Column(name = "record_id")
    private Long recordId;

    @Column(name = "contract_id", nullable = false)
    private Long contractId;

    @Column(name = "type_id")
    private Integer typeId;

    @Column(name = "type_name")
    private String typeName;

    @Column
    private Integer quantity;

    @Column(name = "is_singleton")
    private Boolean isSingleton;

    @Column(name = "group_id")
    private Integer groupId;

    @Column(name = "is_capital")
    private Boolean isCapital;

    // quantity × universe average price; null if no price data
    @Column(name = "estimated_value", precision = 20, scale = 2)
    private BigDecimal estimatedValue;
}
