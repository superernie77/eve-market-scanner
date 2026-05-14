package com.evemarket.backend.repository;

import com.evemarket.backend.model.Contract;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

public interface ContractRepository extends JpaRepository<Contract, Long> {

    @Query("SELECT c.contractId FROM Contract c WHERE c.regionId = :regionId")
    Set<Long> findContractIdsByRegionId(@Param("regionId") int regionId);

    @Query("SELECT DISTINCT c.capitalTypeId, c.capitalTypeName FROM Contract c WHERE c.capitalTypeId IS NOT NULL AND c.dateExpired > :now ORDER BY c.capitalTypeName")
    List<Object[]> findDistinctCapitalTypes(@Param("now") Instant now);

    @Query("SELECT MAX(c.discoveredAt) FROM Contract c WHERE c.regionId = :regionId")
    java.util.Optional<Instant> findLatestDiscoveredAtByRegionId(@Param("regionId") int regionId);

    @Query(value = """
            SELECT c FROM Contract c
            WHERE c.dateExpired > :now
              AND c.capitalTypeId IS NOT NULL
              AND (:regionId IS NULL OR c.regionId = :regionId)
              AND (:capitalTypeId IS NULL OR c.capitalTypeId = :capitalTypeId)
              AND (:capitalGroupName IS NULL OR c.capitalGroupName = :capitalGroupName)
              AND (:maxPrice IS NULL OR c.price <= :maxPrice)
              AND (:priceCompleteOnly = false OR c.priceIncomplete = false)
              AND (:noFittings = false OR c.nonCapItemValue = 0)
            """,
           countQuery = """
            SELECT COUNT(c) FROM Contract c
            WHERE c.dateExpired > :now
              AND c.capitalTypeId IS NOT NULL
              AND (:regionId IS NULL OR c.regionId = :regionId)
              AND (:capitalTypeId IS NULL OR c.capitalTypeId = :capitalTypeId)
              AND (:capitalGroupName IS NULL OR c.capitalGroupName = :capitalGroupName)
              AND (:maxPrice IS NULL OR c.price <= :maxPrice)
              AND (:priceCompleteOnly = false OR c.priceIncomplete = false)
              AND (:noFittings = false OR c.nonCapItemValue = 0)
            """)
    Page<Contract> findActiveContracts(
            @Param("now") Instant now,
            @Param("regionId") Integer regionId,
            @Param("capitalTypeId") Integer capitalTypeId,
            @Param("capitalGroupName") String capitalGroupName,
            @Param("maxPrice") BigDecimal maxPrice,
            @Param("priceCompleteOnly") boolean priceCompleteOnly,
            @Param("noFittings") boolean noFittings,
            Pageable pageable);

    @Query(value = """
            SELECT c FROM Contract c
            WHERE c.dateExpired > :now
              AND c.valueDiff IS NOT NULL
              AND c.price >= :minContractValue
              AND (:minAbsDiff IS NULL OR c.valueDiff >= :minAbsDiff)
              AND (:minPctFraction = 0.0 OR c.valueDiff >= c.totalItemValue * :minPctFraction)
              AND (:regionId IS NULL OR c.regionId = :regionId)
            """,
           countQuery = """
            SELECT COUNT(c) FROM Contract c
            WHERE c.dateExpired > :now
              AND c.valueDiff IS NOT NULL
              AND c.price >= :minContractValue
              AND (:minAbsDiff IS NULL OR c.valueDiff >= :minAbsDiff)
              AND (:minPctFraction = 0.0 OR c.valueDiff >= c.totalItemValue * :minPctFraction)
              AND (:regionId IS NULL OR c.regionId = :regionId)
            """)
    Page<Contract> findDeals(
            @Param("now") Instant now,
            @Param("regionId") Integer regionId,
            @Param("minContractValue") BigDecimal minContractValue,
            @Param("minAbsDiff") BigDecimal minAbsDiff,
            @Param("minPctFraction") double minPctFraction,
            Pageable pageable);

    @Query("SELECT c FROM Contract c WHERE c.valueDiff IS NULL AND c.dateExpired > :now")
    List<Contract> findByValueDiffIsNull(@Param("now") Instant now);

    @Modifying
    @Transactional
    @Query("DELETE FROM Contract c WHERE c.contractId IN :contractIds")
    void deleteByContractIdIn(@Param("contractIds") Set<Long> contractIds);

    @Modifying
    @Transactional
    @Query("DELETE FROM Contract c WHERE c.dateExpired < :cutoff")
    void deleteByDateExpiredBefore(@Param("cutoff") Instant cutoff);
}
