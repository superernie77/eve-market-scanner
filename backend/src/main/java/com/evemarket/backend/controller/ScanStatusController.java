package com.evemarket.backend.controller;

import com.evemarket.backend.repository.ContractRepository;
import com.evemarket.backend.repository.MarketOrderRepository;
import com.evemarket.backend.service.ContractScannerService;
import com.evemarket.backend.service.MarketScannerService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/status")
@RequiredArgsConstructor
public class ScanStatusController {

    private static final Map<Integer, String> REGION_NAMES = Map.ofEntries(
            Map.entry(10000002, "The Forge"),
            Map.entry(10000043, "Domain"),
            Map.entry(10000032, "Sinq Laison"),
            Map.entry(10000030, "Heimatar"),
            Map.entry(10000042, "Metropolis"),
            Map.entry(10000001, "Derelik"),
            Map.entry(10000036, "Devoid"),
            Map.entry(10000048, "Placid"),
            Map.entry(10000016, "Lonetrek")
    );

    private final MarketScannerService marketScannerService;
    private final ContractScannerService contractScannerService;
    private final MarketOrderRepository marketOrderRepository;
    private final ContractRepository contractRepository;

    @GetMapping
    public Map<String, Object> getStatus() {
        Instant now = Instant.now();
        return Map.of(
                "market",    buildMarketStatus(now),
                "contracts", buildContractStatus(now)
        );
    }

    private Map<String, Object> buildMarketStatus(Instant now) {
        boolean scanning   = marketScannerService.isScanning();
        int currentRegion  = marketScannerService.getCurrentRegionId();
        Duration threshold = Duration.ofHours(marketScannerService.getStalenessThresholdHours());

        List<Map<String, Object>> regions = marketScannerService.getRegionIds().stream()
                .map(regionId -> {
                    Instant lastScan = marketOrderRepository.findLatestDiscoveredAtByRegionId(regionId).orElse(null);
                    boolean fresh    = lastScan != null && lastScan.isAfter(now.minus(threshold));
                    boolean active   = scanning && currentRegion == regionId;
                    return regionEntry(regionId, lastScan, fresh, active);
                })
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scanning", scanning);
        result.put("currentRegionId", currentRegion == 0 ? null : currentRegion);
        result.put("regions", regions);
        return result;
    }

    private Map<String, Object> buildContractStatus(Instant now) {
        boolean scanning  = contractScannerService.isScanning();
        int currentRegion = contractScannerService.getCurrentRegionId();
        Duration threshold = Duration.ofMinutes(35);

        List<Map<String, Object>> regions = contractScannerService.getRegionIds().stream()
                .map(regionId -> {
                    // Only use in-memory time — it's updated after every scan regardless of whether
                    // contracts were saved. The DB discoveredAt tracks when contracts were found,
                    // not when the region was scanned, so it's misleading as a fallback.
                    Instant lastScan = contractScannerService.getLastScanAt(regionId);
                    boolean fresh  = lastScan != null && lastScan.isAfter(now.minus(threshold));
                    boolean active = scanning && currentRegion == regionId;
                    return regionEntry(regionId, lastScan, fresh, active);
                })
                .toList();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("scanning", scanning);
        result.put("currentRegionId", currentRegion == 0 ? null : currentRegion);
        result.put("regions", regions);
        return result;
    }

    private Map<String, Object> regionEntry(int regionId, Instant lastScanAt, boolean fresh, boolean active) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("regionId",   regionId);
        m.put("regionName", REGION_NAMES.getOrDefault(regionId, "Region " + regionId));
        m.put("lastScanAt", lastScanAt);
        m.put("fresh",      fresh);
        m.put("active",     active);
        return m;
    }
}
