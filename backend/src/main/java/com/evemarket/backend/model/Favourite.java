package com.evemarket.backend.model;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "favourites")
@Data
@NoArgsConstructor
public class Favourite {

    @Id
    @Column(name = "type_id")
    private Integer typeId;

    @Column(name = "type_name")
    private String typeName;
}
