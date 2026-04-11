package com.evemarket.backend.service;

import com.evemarket.backend.dto.EsiMarketOrderDto;
import com.evemarket.backend.model.MarketOrder;
import com.evemarket.backend.repository.MarketOrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class MarketScannerService {

    private final EsiService esiService;
    private final MarketOrderRepository marketOrderRepository;

    @Value("${app.scanner.region-ids:10000002}")
    private List<Integer> regionIds;

    @Value("${app.scanner.good-deal-threshold-percent:20.0}")
    private double goodDealThreshold;

    @Value("${app.scanner.retention-hours:24}")
    private int retentionHours;

    @Value("${app.scanner.staleness-threshold-hours:1}")
    private int stalenessThresholdHours;

    private final AtomicBoolean scanning = new AtomicBoolean(false);

    @Scheduled(fixedDelayString = "${app.scanner.poll-interval-ms:300000}",
               initialDelayString = "${app.scanner.initial-delay-ms:5000}")
    public void scan() {
        if (!scanning.compareAndSet(false, true)) {
            log.warn("Scan already in progress — skipping.");
            return;
        }
        try {
            log.info("Starting market scan for regions: {}", regionIds);
            Map<Integer, BigDecimal> avgPrices = esiService.fetchAveragePrices();
            for (int regionId : regionIds) {
                try {
                    scanRegion(regionId, avgPrices);
                } catch (Exception e) {
                    log.error("Scan failed for region {}: {}", regionId, e.getMessage(), e);
                }
            }
            pruneOldOrders();
            log.info("Market scan complete.");
            // Enrich item types with group/category info in background
            Thread.ofVirtual().name("category-enrichment").start(esiService::enrichTypeCategories);
        } finally {
            scanning.set(false);
        }
    }

    private void scanRegion(int regionId, Map<Integer, BigDecimal> avgPrices) {
        Instant threshold = Instant.now().minus(stalenessThresholdHours, ChronoUnit.HOURS);
        Instant latest = marketOrderRepository.findLatestDiscoveredAtByRegionId(regionId).orElse(Instant.EPOCH);
        if (latest.isAfter(threshold)) {
            log.info("Region {} data is fresh (last scan: {}), skipping ESI fetch.", regionId, latest);
            return;
        }

        List<EsiMarketOrderDto> sellOrders = esiService.fetchSellOrders(regionId);
        if (sellOrders.isEmpty()) return;

        // Batch-resolve type names and system names before the save transaction
        Set<Integer> typeIds = sellOrders.stream()
                .map(EsiMarketOrderDto::getTypeId)
                .collect(Collectors.toSet());
        Map<Integer, String> typeNames = esiService.resolveTypeNamesBatch(typeIds);

        Set<Long> systemIds = sellOrders.stream()
                .filter(dto -> dto.getSystemId() != null)
                .map(EsiMarketOrderDto::getSystemId)
                .collect(Collectors.toSet());
        Map<Long, String> systemNames = esiService.resolveSystemNamesBatch(systemIds);

        Instant now = Instant.now();
        List<MarketOrder> entities = sellOrders.stream()
                .map(dto -> toEntity(dto, regionId, avgPrices, typeNames, systemNames, now))
                .toList();

        saveInBatches(entities);
        log.info("Saved {} sell orders for region {}", entities.size(), regionId);
    }

    // Save in batches to avoid a single massive transaction with 280k rows
    @Transactional
    public void saveInBatches(List<MarketOrder> orders) {
        int batchSize = 5000;
        for (int i = 0; i < orders.size(); i += batchSize) {
            List<MarketOrder> batch = orders.subList(i, Math.min(i + batchSize, orders.size()));
            marketOrderRepository.saveAll(batch);
        }
    }

    private MarketOrder toEntity(EsiMarketOrderDto dto, int regionId,
                                  Map<Integer, BigDecimal> avgPrices,
                                  Map<Integer, String> typeNames,
                                  Map<Long, String> systemNames,
                                  Instant now) {
        MarketOrder order = new MarketOrder();
        order.setOrderId(dto.getOrderId());
        order.setTypeId(dto.getTypeId());
        order.setRegionId(regionId);
        order.setLocationId(dto.getLocationId());
        order.setPrice(dto.getPrice());
        order.setVolumeTotal(dto.getVolumeTotal());
        order.setVolumeRemain(dto.getVolumeRemain());
        order.setIsBuyOrder(Boolean.TRUE.equals(dto.getIsBuyOrder()));
        order.setRange(dto.getRange());
        order.setIssued(dto.getIssued());
        order.setDiscoveredAt(now);
        order.setTypeName(typeNames.getOrDefault(dto.getTypeId(), "Unknown #" + dto.getTypeId()));
        order.setSystemId(dto.getSystemId());
        order.setSystemName(dto.getSystemId() != null
                ? systemNames.getOrDefault(dto.getSystemId(), "Unknown #" + dto.getSystemId())
                : null);

        BigDecimal avgPrice = avgPrices.get(dto.getTypeId());
        if (avgPrice != null && avgPrice.compareTo(BigDecimal.ZERO) > 0) {
            order.setAveragePrice(avgPrice);
            double discount = avgPrice.subtract(dto.getPrice())
                    .divide(avgPrice, 6, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100))
                    .doubleValue();
            order.setDiscountPercent(discount);
            order.setIsGoodDeal(discount >= goodDealThreshold);
        } else {
            order.setIsGoodDeal(false);
        }

        return order;
    }

    @Transactional
    public void pruneOldOrders() {
        Instant cutoff = Instant.now().minus(retentionHours, ChronoUnit.HOURS);
        marketOrderRepository.deleteByDiscoveredAtBefore(cutoff);
        log.debug("Pruned orders older than {}", cutoff);
    }
}
