package com.evemarket.backend.service;

import com.evemarket.backend.dto.ArbitrageOpportunityDto;
import com.evemarket.backend.repository.MarketOrderRepository;
import com.evemarket.backend.repository.MarketOrderRepository.RegionMinPrice;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class ArbitrageService {

    private final MarketOrderRepository marketOrderRepository;

    private static final Map<Integer, String> REGION_NAMES = Map.of(
            10000002, "The Forge",
            10000043, "Domain",
            10000032, "Sinq Laison",
            10000030, "Heimatar",
            10000042, "Metropolis"
    );

    public List<ArbitrageOpportunityDto> findArbitrageOpportunities(
            BigDecimal minAvgPrice,
            BigDecimal maxAvgPrice,
            String typeNameLike,
            String categoryName,
            double minGapPercent,
            int limit,
            Map<Integer, Set<Integer>> listedRegionsByType,
            Set<Integer> typeIdFilter) {

        List<RegionMinPrice> rows =
                marketOrderRepository.findMinSellPricePerTypeAndRegion(minAvgPrice, maxAvgPrice, typeNameLike, categoryName);

        // Group by typeId
        Map<Integer, List<RegionMinPrice>> byType = new HashMap<>();
        for (RegionMinPrice row : rows) {
            if (typeIdFilter != null && !typeIdFilter.contains(row.getTypeId())) continue;
            byType.computeIfAbsent(row.getTypeId(), k -> new ArrayList<>()).add(row);
        }

        List<ArbitrageOpportunityDto> results = new ArrayList<>();

        for (var entry : byType.entrySet()) {
            List<RegionMinPrice> regionPrices = entry.getValue();
            if (regionPrices.size() < 2) continue;

            Set<Integer> listedRegions = listedRegionsByType.getOrDefault(entry.getKey(), Collections.emptySet());

            // Generate all valid buy→sell pairs (not just cheapest→priciest)
            for (int i = 0; i < regionPrices.size(); i++) {
                for (int j = 0; j < regionPrices.size(); j++) {
                    if (i == j) continue;
                    RegionMinPrice buy  = regionPrices.get(i);
                    RegionMinPrice sell = regionPrices.get(j);

                    if (buy.getMinPrice().compareTo(BigDecimal.ZERO) == 0) continue;
                    // Only emit each directional pair once: buy must be cheaper than sell
                    if (buy.getMinPrice().compareTo(sell.getMinPrice()) >= 0) continue;

                    double gap = sell.getMinPrice()
                            .subtract(buy.getMinPrice())
                            .divide(buy.getMinPrice(), 6, RoundingMode.HALF_UP)
                            .multiply(BigDecimal.valueOf(100))
                            .doubleValue();

                    if (gap < minGapPercent) continue;

                    ArbitrageOpportunityDto dto = new ArbitrageOpportunityDto();
                    dto.setTypeId(entry.getKey());
                    dto.setTypeName(buy.getTypeName());
                    dto.setBuyRegionId(buy.getRegionId());
                    dto.setBuyRegionName(REGION_NAMES.getOrDefault(buy.getRegionId(), "Region " + buy.getRegionId()));
                    dto.setBuyPrice(buy.getMinPrice());
                    dto.setSellRegionId(sell.getRegionId());
                    dto.setSellRegionName(REGION_NAMES.getOrDefault(sell.getRegionId(), "Region " + sell.getRegionId()));
                    dto.setSellPrice(sell.getMinPrice());
                    dto.setGapPercent(gap);
                    dto.setVolumeAvailable(buy.getVolumeAvailable());
                    dto.setAveragePrice(buy.getAveragePrice());
                    dto.setAlreadyListed(listedRegions.contains(sell.getRegionId()));
                    results.add(dto);
                }
            }
        }

        results.sort(Comparator.comparingDouble(ArbitrageOpportunityDto::getGapPercent).reversed());
        log.info("Found {} arbitrage opportunities (minGap={}%, minAvgPrice={})",
                Math.min(results.size(), limit), minGapPercent, minAvgPrice);
        return results.size() > limit ? results.subList(0, limit) : results;
    }
}
