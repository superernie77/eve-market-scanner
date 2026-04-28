package com.evemarket.backend.repository;

import com.evemarket.backend.model.Contract;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Set;

public interface ContractRepository extends JpaRepository<Contract, Long> {

    @Query("SELECT c.contractId FROM Contract c WHERE c.regionId = :regionId")
    Set<Long> findContractIdsByRegionId(@Param("regionId") int regionId);

    @Query(value = """
            SELECT c FROM Contract c
            WHERE c.dateExpired > :now
              AND (:regionId IS NULL OR c.regionId = :regionId)
              AND (:capitalTypeId IS NULL OR c.capitalTypeId = :capitalTypeId)
              AND (:maxPrice IS NULL OR c.price <= :maxPrice)
              AND (:priceCompleteOnly = false OR c.priceIncomplete = false)
            """,
           countQuery = """
            SELECT COUNT(c) FROM Contract c
            WHERE c.dateExpired > :now
              AND (:regionId IS NULL OR c.regionId = :regionId)
              AND (:capitalTypeId IS NULL OR c.capitalTypeId = :capitalTypeId)
              AND (:maxPrice IS NULL OR c.price <= :maxPrice)
              AND (:priceCompleteOnly = false OR c.priceIncomplete = false)
            """)
    Page<Contract> findActiveContracts(
            @Param("now") Instant now,
            @Param("regionId") Integer regionId,
            @Param("capitalTypeId") Integer capitalTypeId,
            @Param("maxPrice") BigDecimal maxPrice,
            @Param("priceCompleteOnly") boolean priceCompleteOnly,
            Pageable pageable);

    void deleteByDateExpiredBefore(Instant cutoff);
}
