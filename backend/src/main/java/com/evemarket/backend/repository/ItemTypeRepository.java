package com.evemarket.backend.repository;

import com.evemarket.backend.model.ItemType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ItemTypeRepository extends JpaRepository<ItemType, Integer> {
    Optional<ItemType> findByTypeId(Integer typeId);

    List<ItemType> findByCategoryNameIsNull();

    @Query("SELECT DISTINCT it.categoryName FROM ItemType it WHERE it.categoryName IS NOT NULL ORDER BY it.categoryName")
    List<String> findDistinctCategoryNames();
}
