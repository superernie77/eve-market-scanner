package com.evemarket.backend.service;

import com.evemarket.backend.dto.EsiContractDto;
import com.evemarket.backend.dto.EsiContractItemDto;
import com.evemarket.backend.model.Contract;
import com.evemarket.backend.model.ContractItem;
import com.evemarket.backend.repository.ContractRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ContractScannerService {

    private static final Map<Integer, String> CAPITAL_GROUP_NAMES = Map.of(
            30,   "Titan",
            485,  "Dreadnought",
            547,  "Carrier",
            659,  "Supercarrier",
            883,  "Capital Industrial Ship",
            1538, "Force Auxiliary",
            902,  "Jump Freighter"
    );

    private static final Map<Integer, String> REGION_NAMES = Map.of(
            10000001, "Derelik",
            10000043, "Domain"
    );

    private final EsiService esiService;
    private final ContractRepository contractRepository;
    private final ContractPersistenceService contractPersistenceService;

    @Value("${app.contracts.enabled:true}")
    private boolean enabled;

    @Value("${app.contracts.region-ids:10000001,10000043}")
    private List<Integer> regionIds;

    @Value("${app.contracts.capital-group-ids:30,485,547,659,883,1538,902}")
    private Set<Integer> capitalGroupIds;

    private final AtomicBoolean scanning = new AtomicBoolean(false);

    @Scheduled(fixedDelayString  = "${app.contracts.poll-interval-ms:1800000}",
               initialDelayString = "${app.contracts.initial-delay-ms:60000}")
    public void scan() {
        if (!enabled) return;
        if (!scanning.compareAndSet(false, true)) {
            log.warn("Contract scan already in progress — skipping.");
            return;
        }
        try {
            log.info("Starting contract scan for regions: {}", regionIds);
            Map<Integer, BigDecimal> universePrices = esiService.fetchAveragePrices();
            for (int regionId : regionIds) {
                try {
                    scanRegion(regionId, universePrices);
                } catch (Exception e) {
                    log.error("Contract scan failed for region {}: {}", regionId, e.getMessage(), e);
                }
            }
            pruneExpiredContracts();
            log.info("Contract scan complete.");
        } finally {
            scanning.set(false);
        }
    }

    private void scanRegion(int regionId, Map<Integer, BigDecimal> universePrices) {
        List<EsiContractDto> all = esiService.fetchContracts(regionId);

        Instant now = Instant.now();
        List<EsiContractDto> candidates = all.stream()
                .filter(c -> "item_exchange".equals(c.getType()))
                .filter(c -> c.getDateExpired() != null && c.getDateExpired().isAfter(now))
                .toList();

        if (candidates.isEmpty()) {
            log.info("No item_exchange contracts found in region {}", regionId);
            return;
        }

        Set<Long> existingIds = contractRepository.findContractIdsByRegionId(regionId);
        List<EsiContractDto> newContracts = candidates.stream()
                .filter(c -> !existingIds.contains(c.getContractId()))
                .toList();

        if (newContracts.isEmpty()) {
            log.info("No new contracts for region {} ({} already indexed)", regionId, existingIds.size());
            return;
        }

        log.info("Fetching items for {} new contracts in region {}", newContracts.size(), regionId);

        List<Long> ids = newContracts.stream().map(EsiContractDto::getContractId).toList();
        Map<Long, List<EsiContractItemDto>> itemsByContract = esiService.fetchContractItemsBulk(ids);

        // Collect all included typeIds across all fetched contracts
        Set<Integer> allTypeIds = itemsByContract.values().stream()
                .flatMap(List::stream)
                .filter(i -> Boolean.TRUE.equals(i.getIsIncluded()))
                .map(EsiContractItemDto::getTypeId)
                .collect(Collectors.toSet());

        if (allTypeIds.isEmpty()) {
            log.info("No items found in new contracts for region {}", regionId);
            return;
        }

        Map<Integer, String> typeNames = esiService.resolveTypeNamesBatch(allTypeIds);
        Map<Integer, Integer> groupIds  = esiService.resolveGroupIdsBatch(allTypeIds);

        List<Contract>     contractsToSave = new ArrayList<>();
        List<ContractItem> itemsToSave     = new ArrayList<>();

        for (EsiContractDto dto : newContracts) {
            List<EsiContractItemDto> rawItems = itemsByContract.get(dto.getContractId());
            if (rawItems == null || rawItems.isEmpty()) continue;

            List<EsiContractItemDto> included = rawItems.stream()
                    .filter(i -> Boolean.TRUE.equals(i.getIsIncluded()))
                    .toList();

            boolean hasCapital = included.stream()
                    .anyMatch(i -> capitalGroupIds.contains(groupIds.getOrDefault(i.getTypeId(), -1)));

            if (!hasCapital) continue;

            Contract contract = buildContract(dto, included, typeNames, groupIds, universePrices, regionId, now);
            contractsToSave.add(contract);

            for (EsiContractItemDto item : included) {
                ContractItem ci = new ContractItem();
                ci.setRecordId(item.getRecordId());
                ci.setContractId(dto.getContractId());
                ci.setTypeId(item.getTypeId());
                ci.setTypeName(typeNames.getOrDefault(item.getTypeId(), "Unknown #" + item.getTypeId()));
                ci.setQuantity(item.getQuantity() != null ? item.getQuantity() : 1);
                ci.setIsSingleton(Boolean.TRUE.equals(item.getIsSingleton()));
                int gid = groupIds.getOrDefault(item.getTypeId(), -1);
                ci.setGroupId(gid > 0 ? gid : null);
                boolean isCap = capitalGroupIds.contains(gid);
                ci.setIsCapital(isCap);
                if (!isCap) {
                    BigDecimal unitPrice = universePrices.get(item.getTypeId());
                    if (unitPrice != null) {
                        int qty = item.getQuantity() != null ? item.getQuantity() : 1;
                        ci.setEstimatedValue(unitPrice.multiply(BigDecimal.valueOf(qty)));
                    }
                }
                itemsToSave.add(ci);
            }
        }

        if (!contractsToSave.isEmpty()) {
            contractPersistenceService.saveAll(contractsToSave, itemsToSave);
            log.info("Saved {} capital contracts for region {}", contractsToSave.size(), regionId);
        } else {
            log.info("No capital contracts found among new contracts in region {}", regionId);
        }
    }

    private Contract buildContract(EsiContractDto dto,
                                   List<EsiContractItemDto> included,
                                   Map<Integer, String> typeNames,
                                   Map<Integer, Integer> groupIds,
                                   Map<Integer, BigDecimal> universePrices,
                                   int regionId, Instant now) {
        Contract c = new Contract();
        c.setContractId(dto.getContractId());
        c.setRegionId(regionId);
        c.setIssuerId(dto.getIssuerId());
        c.setIssuerCorporationId(dto.getIssuerCorporationId());
        c.setStartLocationId(dto.getStartLocationId());
        c.setPrice(dto.getPrice() != null ? dto.getPrice() : BigDecimal.ZERO);
        c.setDateIssued(dto.getDateIssued());
        c.setDateExpired(dto.getDateExpired());
        c.setTitle(dto.getTitle() != null ? dto.getTitle().trim() : "");
        c.setDiscoveredAt(now);

        List<EsiContractItemDto> capitalItems = included.stream()
                .filter(i -> capitalGroupIds.contains(groupIds.getOrDefault(i.getTypeId(), -1)))
                .toList();

        EsiContractItemDto primaryCap = capitalItems.get(0);
        c.setCapitalTypeId(primaryCap.getTypeId());
        c.setCapitalTypeName(typeNames.getOrDefault(primaryCap.getTypeId(), "Unknown Capital"));
        int primaryGid = groupIds.getOrDefault(primaryCap.getTypeId(), -1);
        c.setCapitalGroupName(CAPITAL_GROUP_NAMES.getOrDefault(primaryGid, "Capital Ship"));

        int totalCapQty = capitalItems.stream()
                .mapToInt(i -> i.getQuantity() != null ? i.getQuantity() : 1)
                .sum();
        c.setCapitalQuantity(totalCapQty);

        boolean mixed = capitalItems.stream()
                .map(EsiContractItemDto::getTypeId)
                .distinct().count() > 1;
        c.setHasMixedCapitals(mixed);

        // Non-capital item value
        BigDecimal nonCapValue = BigDecimal.ZERO;
        int unknownCount = 0;
        for (EsiContractItemDto item : included) {
            if (capitalGroupIds.contains(groupIds.getOrDefault(item.getTypeId(), -1))) continue;
            BigDecimal unitPrice = universePrices.get(item.getTypeId());
            if (unitPrice != null) {
                int qty = item.getQuantity() != null ? item.getQuantity() : 1;
                nonCapValue = nonCapValue.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
            } else {
                unknownCount++;
            }
        }

        c.setNonCapItemValue(nonCapValue);
        BigDecimal effectiveTotal = c.getPrice().subtract(nonCapValue);
        c.setEffectiveCapitalPrice(effectiveTotal);
        c.setPriceIncomplete(unknownCount > 0);
        c.setUnknownPriceItemCount(unknownCount);

        if (!mixed && totalCapQty > 1) {
            c.setEffectivePricePerUnit(
                    effectiveTotal.divide(BigDecimal.valueOf(totalCapQty), 2, RoundingMode.HALF_UP));
        } else {
            c.setEffectivePricePerUnit(effectiveTotal);
        }

        return c;
    }

    @Transactional
    public void pruneExpiredContracts() {
        contractRepository.deleteByDateExpiredBefore(Instant.now());
    }
}
