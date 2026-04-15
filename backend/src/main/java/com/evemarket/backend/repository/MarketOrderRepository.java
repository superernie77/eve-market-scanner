package com.evemarket.backend.repository;

import com.evemarket.backend.model.MarketOrder;
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
import java.util.Optional;

public interface MarketOrderRepository extends JpaRepository<MarketOrder, Long> {

    Page<MarketOrder> findByIsGoodDealTrueOrderByDiscountPercentDesc(Pageable pageable);

    Page<MarketOrder> findByRegionIdAndIsGoodDealTrueOrderByDiscountPercentDesc(Integer regionId, Pageable pageable);

    Page<MarketOrder> findByRegionIdAndTypeIdAndIsGoodDealTrueOrderByDiscountPercentDesc(
            Integer regionId, Integer typeId, Pageable pageable);

    @Query("SELECT o FROM MarketOrder o WHERE (:regionId IS NULL OR o.regionId = :regionId) " +
           "AND (:typeId IS NULL OR o.typeId = :typeId) " +
           "AND (:goodDealsOnly = false OR o.isGoodDeal = true) " +
           "AND (:isBuyOrder IS NULL OR o.isBuyOrder = :isBuyOrder) " +
           "AND (:minAvgPrice IS NULL OR o.averagePrice >= :minAvgPrice) " +
           "AND (:maxAvgPrice IS NULL OR o.averagePrice <= :maxAvgPrice) " +
           "AND (:typeNameLike IS NULL OR LOWER(o.typeName) LIKE LOWER(CONCAT('%', CAST(:typeNameLike AS string), '%'))) " +
           "AND (:categoryName IS NULL OR EXISTS (" +
           "  SELECT 1 FROM ItemType it WHERE it.typeId = o.typeId AND it.categoryName = :categoryName)) " +
           "")
    Page<MarketOrder> findFiltered(
            @Param("regionId") Integer regionId,
            @Param("typeId") Integer typeId,
            @Param("goodDealsOnly") boolean goodDealsOnly,
            @Param("isBuyOrder") Boolean isBuyOrder,
            @Param("minAvgPrice") java.math.BigDecimal minAvgPrice,
            @Param("maxAvgPrice") java.math.BigDecimal maxAvgPrice,
            @Param("typeNameLike") String typeNameLike,
            @Param("categoryName") String categoryName,
            Pageable pageable);

    @Modifying
    @Transactional
    @Query("DELETE FROM MarketOrder o WHERE o.discoveredAt < :cutoff")
    void deleteByDiscoveredAtBefore(@Param("cutoff") Instant cutoff);

    @Query("SELECT MAX(o.discoveredAt) FROM MarketOrder o WHERE o.regionId = :regionId")
    Optional<Instant> findLatestDiscoveredAtByRegionId(@Param("regionId") Integer regionId);

    // ── Arbitrage: min sell price per (typeId, regionId) ─────────────────────

    interface RegionMinPrice {
        Integer getTypeId();
        String  getTypeName();
        Integer getRegionId();
        BigDecimal getMinPrice();
        Integer getVolumeAvailable();
        BigDecimal getAveragePrice();
    }

    @Query(value = """
            SELECT
                mo.type_id            AS typeId,
                mo.type_name          AS typeName,
                mo.region_id          AS regionId,
                MIN(mo.price)         AS minPrice,
                SUM(mo.volume_remain) AS volumeAvailable,
                MIN(mo.average_price) AS averagePrice
            FROM market_orders mo
            WHERE mo.is_buy_order = FALSE
              AND (:minAvgPrice IS NULL OR mo.average_price >= :minAvgPrice)
              AND (:maxAvgPrice IS NULL OR mo.average_price <= :maxAvgPrice)
              AND (:typeNameLike IS NULL OR LOWER(mo.type_name) LIKE LOWER(CONCAT('%', CAST(:typeNameLike AS text), '%')))
              AND (:categoryName IS NULL OR EXISTS (
                    SELECT 1 FROM item_types it
                    WHERE it.type_id = mo.type_id
                      AND it.category_name = :categoryName))
            GROUP BY mo.type_id, mo.type_name, mo.region_id
            """, nativeQuery = true)
    List<RegionMinPrice> findMinSellPricePerTypeAndRegion(
            @Param("minAvgPrice") BigDecimal minAvgPrice,
            @Param("maxAvgPrice") BigDecimal maxAvgPrice,
            @Param("typeNameLike") String typeNameLike,
            @Param("categoryName") String categoryName);

    @Query("SELECT o FROM MarketOrder o WHERE o.regionId = :regionId " +
           "AND (:minAvgPrice IS NULL OR o.averagePrice >= :minAvgPrice) " +
           "AND (:maxAvgPrice IS NULL OR o.averagePrice <= :maxAvgPrice) " +
           "AND (:typeNameLike IS NULL OR LOWER(o.typeName) LIKE LOWER(CONCAT('%', CAST(:typeNameLike AS string), '%'))) " +
           "AND (:categoryName IS NULL OR EXISTS (" +
           "  SELECT 1 FROM ItemType it WHERE it.typeId = o.typeId AND it.categoryName = :categoryName)) " +
           "ORDER BY o.discountPercent DESC")
    List<MarketOrder> findTopDealsByRegion(
            @Param("regionId") Integer regionId,
            @Param("minAvgPrice") java.math.BigDecimal minAvgPrice,
            @Param("maxAvgPrice") java.math.BigDecimal maxAvgPrice,
            @Param("typeNameLike") String typeNameLike,
            @Param("categoryName") String categoryName,
            Pageable pageable);
}
