package com.evemarket.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "item_types")
@Data
@NoArgsConstructor
public class ItemType {

    @Id
    @Column(name = "type_id")
    private Integer typeId;

    @Column(nullable = false)
    private String name;

    private String description;

    @Column(name = "average_price", precision = 20, scale = 2)
    private BigDecimal averagePrice;

    @Column(name = "group_id")
    private Integer groupId;

    @Column(name = "group_name")
    private String groupName;

    @Column(name = "category_id")
    private Integer categoryId;

    @Column(name = "category_name")
    private String categoryName;

    @Column(name = "last_updated")
    private Instant lastUpdated;
}
