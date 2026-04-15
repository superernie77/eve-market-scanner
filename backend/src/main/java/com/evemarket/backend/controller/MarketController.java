package com.evemarket.backend.controller;

import com.evemarket.backend.dto.ArbitrageOpportunityDto;
import com.evemarket.backend.dto.MarketOfferDto;
import com.evemarket.backend.dto.MyOrderDto;
import com.evemarket.backend.model.MarketOrder;
import com.evemarket.backend.repository.ItemTypeRepository;
import com.evemarket.backend.repository.MarketOrderRepository;
import com.evemarket.backend.service.ArbitrageService;
import com.evemarket.backend.service.CharacterSession;
import com.evemarket.backend.service.EveSsoService;
import com.evemarket.backend.service.MarketScannerService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/market")
@RequiredArgsConstructor
public class MarketController {

    private final MarketOrderRepository marketOrderRepository;
    private final ItemTypeRepository itemTypeRepository;
    private final MarketScannerService marketScannerService;
    private final ArbitrageService arbitrageService;
    private final CharacterSession characterSession;
    private final EveSsoService eveSsoService;

    /**
     * Get paginated market orders with optional filters.
     *
     * @param regionId      EVE region ID (default: 10000002 = The Forge)
     * @param typeId        Filter by item type ID (optional)
     * @param goodDealsOnly Only return orders flagged as good deals
     * @param isBuyOrder    Filter by buy/sell orders (null = both)
     * @param page          Page number (0-based)
     * @param size          Page size
     */
    @GetMapping("/orders")
    public Page<MarketOfferDto> getOrders(
            @RequestParam(required = false) Integer regionId,
            @RequestParam(required = false) Integer typeId,
            @RequestParam(defaultValue = "false") boolean goodDealsOnly,
            @RequestParam(required = false) Boolean isBuyOrder,
            @RequestParam(required = false) BigDecimal minAveragePrice,
            @RequestParam(required = false) BigDecimal maxAveragePrice,
            @RequestParam(required = false) String typeName,
            @RequestParam(required = false) String categoryName,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "discountPercent") String sortBy,
            @RequestParam(defaultValue = "desc") String sortDir) {

        Sort.Direction direction = "asc".equalsIgnoreCase(sortDir) ? Sort.Direction.ASC : Sort.Direction.DESC;
        String sortField = List.of("typeName", "price", "discountPercent", "discoveredAt", "volumeRemain").contains(sortBy)
                ? sortBy : "discountPercent";
        Sort sort = sortField.equals("discountPercent")
                ? Sort.by(Sort.Order.by("discountPercent").nullsLast().with(direction))
                : Sort.by(direction, sortField);
        PageRequest pageable = PageRequest.of(page, size, sort);
        String typeNameLike = (typeName != null && !typeName.isBlank()) ? typeName.trim() : null;

        return marketOrderRepository
                .findFiltered(regionId, typeId, goodDealsOnly, isBuyOrder, minAveragePrice, maxAveragePrice, typeNameLike, categoryName, pageable)
                .map(this::toDto);
    }

    /**
     * Get top 10 best deals in a region (by discount %).
     */
    @GetMapping("/top-deals")
    public ResponseEntity<?> getTopDeals(
            @RequestParam(defaultValue = "10000002") Integer regionId,
            @RequestParam(required = false) BigDecimal minAveragePrice,
            @RequestParam(required = false) BigDecimal maxAveragePrice,
            @RequestParam(required = false) String typeName,
            @RequestParam(required = false) String categoryName) {

        String typeNameLike = (typeName != null && !typeName.isBlank()) ? typeName.trim() : null;
        return ResponseEntity.ok(
                marketOrderRepository.findTopDealsByRegion(regionId, minAveragePrice, maxAveragePrice, typeNameLike, categoryName, PageRequest.of(0, 10))
                        .stream().map(this::toDto).toList()
        );
    }

    /**
     * List all known item categories (populated progressively as ESI enrichment runs).
     */
    @GetMapping("/categories")
    public ResponseEntity<List<String>> getCategories() {
        return ResponseEntity.ok(itemTypeRepository.findDistinctCategoryNames());
    }

    /**
     * Trigger an immediate market scan manually (useful for testing).
     */
    @PostMapping("/scan")
    public ResponseEntity<Map<String, String>> triggerScan() {
        new Thread(marketScannerService::scan).start();
        return ResponseEntity.accepted().body(Map.of("status", "scan triggered"));
    }

    /**
     * Get scan statistics.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> getStats(
            @RequestParam(defaultValue = "10000002") Integer regionId) {

        long total = marketOrderRepository.count();
        long goodDeals = marketOrderRepository
                .findByRegionIdAndIsGoodDealTrueOrderByDiscountPercentDesc(regionId, PageRequest.of(0, 1))
                .getTotalElements();

        return ResponseEntity.ok(Map.of(
                "totalOrders", total,
                "goodDeals", goodDeals,
                "regionId", regionId
        ));
    }

    /**
     * Inter-regional arbitrage opportunities — items with the biggest
     * lowest-sell-price gap between the 4 major trade hub regions.
     */
    @GetMapping("/arbitrage")
    public ResponseEntity<List<ArbitrageOpportunityDto>> getArbitrageOpportunities(
            @RequestParam(required = false) BigDecimal minAveragePrice,
            @RequestParam(required = false) BigDecimal maxAveragePrice,
            @RequestParam(required = false) String typeName,
            @RequestParam(required = false) String categoryName,
            @RequestParam(defaultValue = "5.0") double minGapPercent,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(required = false) List<Integer> typeIds) {

        String typeNameLike = (typeName != null && !typeName.isBlank()) ? typeName.trim() : null;
        Set<Integer> typeIdFilter = (typeIds != null && !typeIds.isEmpty()) ? new java.util.HashSet<>(typeIds) : null;

        Map<Integer, Set<Integer>> listedRegionsByType = Collections.emptyMap();
        if (characterSession.isLoggedIn()) {
            try {
                eveSsoService.refreshIfNeeded();
                listedRegionsByType = eveSsoService.fetchCharacterSellOrderRegions();
            } catch (Exception e) {
                // Don't fail the whole request if character orders can't be fetched
            }
        }

        return ResponseEntity.ok(
                arbitrageService.findArbitrageOpportunities(
                        minAveragePrice, maxAveragePrice, typeNameLike, categoryName,
                        minGapPercent, limit, listedRegionsByType, typeIdFilter));
    }

    /**
     * Returns all active sell orders for the logged-in character and their corporation.
     * Returns an empty list if no character is authenticated.
     */
    @GetMapping("/my-orders")
    public ResponseEntity<List<MyOrderDto>> getMyOrders() {
        if (!characterSession.isLoggedIn()) return ResponseEntity.ok(List.of());
        try {
            eveSsoService.refreshIfNeeded();
            return ResponseEntity.ok(eveSsoService.fetchMyActiveOrders(false));
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    @GetMapping("/my-buy-orders")
    public ResponseEntity<List<MyOrderDto>> getMyBuyOrders() {
        if (!characterSession.isLoggedIn()) return ResponseEntity.ok(List.of());
        try {
            eveSsoService.refreshIfNeeded();
            return ResponseEntity.ok(eveSsoService.fetchMyActiveOrders(true));
        } catch (Exception e) {
            return ResponseEntity.ok(List.of());
        }
    }

    private MarketOfferDto toDto(MarketOrder order) {
        MarketOfferDto dto = new MarketOfferDto();
        dto.setOrderId(order.getOrderId());
        dto.setTypeId(order.getTypeId());
        dto.setTypeName(order.getTypeName());
        dto.setLocationId(order.getLocationId());
        dto.setSystemId(order.getSystemId());
        dto.setSystemName(order.getSystemName());
        dto.setPrice(order.getPrice());
        dto.setAveragePrice(order.getAveragePrice());
        dto.setDiscountPercent(order.getDiscountPercent());
        dto.setVolumeRemain(order.getVolumeRemain());
        dto.setIsBuyOrder(order.getIsBuyOrder());
        dto.setRange(order.getRange());
        dto.setIssued(order.getIssued());
        dto.setDiscoveredAt(order.getDiscoveredAt());
        return dto;
    }
}
