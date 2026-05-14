package com.evemarket.backend.service;

import com.evemarket.backend.dto.EsiContractDto;
import com.evemarket.backend.dto.EsiContractItemDto;
import com.evemarket.backend.model.Contract;
import com.evemarket.backend.model.ContractItem;
import com.evemarket.backend.repository.ContractItemRepository;
import com.evemarket.backend.repository.ContractRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
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
            10000043, "Domain",
            10000036, "Devoid"
    );

    private final EsiService esiService;
    private final ContractRepository contractRepository;
    private final ContractItemRepository contractItemRepository;
    private final ContractPersistenceService contractPersistenceService;

    @Value("${app.contracts.enabled:true}")
    private boolean enabled;

    @Value("${app.contracts.region-ids:10000001,10000043}")
    private List<Integer> regionIds;

    @Value("${app.contracts.capital-group-ids:30,485,547,659,883,1538,902}")
    private Set<Integer> capitalGroupIds;

    private final AtomicBoolean scanning = new AtomicBoolean(false);
    private final AtomicInteger currentScanRegionId = new AtomicInteger(0);
    private final Map<Integer, Instant> lastRegionScanAt = new ConcurrentHashMap<>();

    public boolean isScanning()                   { return scanning.get(); }
    public int getCurrentRegionId()               { return currentScanRegionId.get(); }
    public List<Integer> getRegionIds()           { return Collections.unmodifiableList(regionIds); }
    public Instant getLastScanAt(int regionId)    { return lastRegionScanAt.get(regionId); }

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
                    currentScanRegionId.set(regionId);
                    scanRegion(regionId, universePrices);
                } catch (Exception e) {
                    log.error("Contract scan failed for region {}: {}", regionId, e.getMessage(), e);
                } finally {
                    lastRegionScanAt.put(regionId, Instant.now());
                }
            }
            pruneExpiredContracts();
            log.info("Contract scan complete.");
        } finally {
            scanning.set(false);
            currentScanRegionId.set(0);
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

        // Remove contracts that ESI no longer returns (completed or cancelled in-game)
        Set<Long> liveIds = all.stream().map(EsiContractDto::getContractId).collect(Collectors.toSet());
        Set<Long> removedIds = existingIds.stream().filter(id -> !liveIds.contains(id)).collect(Collectors.toSet());
        if (!removedIds.isEmpty()) {
            contractItemRepository.deleteByContractIdIn(removedIds);
            contractRepository.deleteByContractIdIn(removedIds);
            log.info("Removed {} contracts no longer on ESI for region {}", removedIds.size(), regionId);
        }

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

        Set<Integer> uniqueGroupIds = new HashSet<>(groupIds.values());
        Set<Integer> rigGroupIds    = esiService.resolveRigGroupIds(uniqueGroupIds);
        Map<Integer, BigDecimal> packagedVolumes = esiService.resolvePackagedVolumesBatch(allTypeIds);

        // Resolve station/structure names (NPC stations resolve via /universe/names/;
        // player structures that fail silently fall back to "Unknown Structure #ID")
        Set<Long> locationIds = newContracts.stream()
                .map(EsiContractDto::getStartLocationId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<Long, EsiService.LocationResolution> locationNames = esiService.resolveLocationNamesBatch(locationIds);

        List<Contract>     contractsToSave = new ArrayList<>();
        List<ContractItem> itemsToSave     = new ArrayList<>();

        for (EsiContractDto dto : newContracts) {
            List<EsiContractItemDto> rawItems = itemsByContract.get(dto.getContractId());
            if (rawItems == null || rawItems.isEmpty()) continue;

            List<EsiContractItemDto> included = rawItems.stream()
                    .filter(i -> Boolean.TRUE.equals(i.getIsIncluded()))
                    .toList();

            if (included.isEmpty()) continue;

            Contract contract = buildContract(dto, included, typeNames, groupIds, universePrices, locationNames, regionId, now, included.size());
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
                ci.setIsRig(!isCap && rigGroupIds.contains(gid));
                ci.setPackagedVolume(packagedVolumes.get(item.getTypeId()));
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
                                   Map<Long, EsiService.LocationResolution> locationNames,
                                   int regionId, Instant now, int itemCount) {
        Contract c = new Contract();
        c.setContractId(dto.getContractId());
        c.setRegionId(regionId);
        c.setIssuerId(dto.getIssuerId());
        c.setIssuerCorporationId(dto.getIssuerCorporationId());
        c.setStartLocationId(dto.getStartLocationId());
        c.setItemCount(itemCount);
        if (dto.getStartLocationId() != null) {
            EsiService.LocationResolution loc = locationNames.get(dto.getStartLocationId());
            if (loc != null) {
                c.setStartLocationName(loc.stationName());
                c.setStartSystemName(loc.systemName());
            } else {
                c.setStartLocationName("Unknown #" + dto.getStartLocationId());
            }
        }
        c.setPrice(dto.getPrice() != null ? dto.getPrice() : BigDecimal.ZERO);
        c.setVolume(dto.getVolume());
        c.setDateIssued(dto.getDateIssued());
        c.setDateExpired(dto.getDateExpired());
        c.setTitle(dto.getTitle() != null ? dto.getTitle().trim() : "");
        c.setDiscoveredAt(now);

        List<EsiContractItemDto> capitalItems = included.stream()
                .filter(i -> capitalGroupIds.contains(groupIds.getOrDefault(i.getTypeId(), -1)))
                .toList();

        // Non-capital item value
        BigDecimal nonCapValue = BigDecimal.ZERO;
        int unknownCount = 0;
        for (EsiContractItemDto item : included) {
            if (capitalGroupIds.contains(groupIds.getOrDefault(item.getTypeId(), -1))) continue;
            BigDecimal unitPrice = universePrices.get(item.getTypeId());
            if (unitPrice != null) {
                int qty = item.getQuantity() != null ? item.getQuantity().intValue() : 1;
                nonCapValue = nonCapValue.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
            } else {
                unknownCount++;
            }
        }
        c.setNonCapItemValue(nonCapValue);
        c.setPriceIncomplete(unknownCount > 0);
        c.setUnknownPriceItemCount(unknownCount);

        if (!capitalItems.isEmpty()) {
            EsiContractItemDto primaryCap = capitalItems.get(0);
            c.setCapitalTypeId(primaryCap.getTypeId());
            c.setCapitalTypeName(typeNames.getOrDefault(primaryCap.getTypeId(), "Unknown Capital"));
            int primaryGid = groupIds.getOrDefault(primaryCap.getTypeId(), -1);
            c.setCapitalGroupName(CAPITAL_GROUP_NAMES.getOrDefault(primaryGid, "Capital Ship"));

            int totalCapQty = capitalItems.stream()
                    .mapToInt(i -> { Integer q = i.getQuantity(); return q != null ? q.intValue() : 1; })
                    .sum();
            c.setCapitalQuantity(totalCapQty);

            boolean mixed = capitalItems.stream()
                    .map(EsiContractItemDto::getTypeId)
                    .distinct().count() > 1;
            c.setHasMixedCapitals(mixed);

            BigDecimal effectiveTotal = c.getPrice().subtract(nonCapValue);
            c.setEffectiveCapitalPrice(effectiveTotal);

            if (!mixed && totalCapQty > 1) {
                c.setEffectivePricePerUnit(
                        effectiveTotal.divide(BigDecimal.valueOf(totalCapQty), 2, RoundingMode.HALF_UP));
            } else {
                c.setEffectivePricePerUnit(effectiveTotal);
            }
        }

        // Total item value = non-cap value + capital items at universe avg price
        BigDecimal capValue = BigDecimal.ZERO;
        boolean totalIncomplete = unknownCount > 0;
        for (EsiContractItemDto item : included) {
            if (!capitalGroupIds.contains(groupIds.getOrDefault(item.getTypeId(), -1))) continue;
            BigDecimal unitPrice = universePrices.get(item.getTypeId());
            if (unitPrice != null) {
                Integer rawQty = item.getQuantity();
                int qty = rawQty != null ? rawQty.intValue() : 1;
                capValue = capValue.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
            } else {
                totalIncomplete = true;
            }
        }
        BigDecimal totalItemValue = nonCapValue.add(capValue);
        BigDecimal valueDiff = totalItemValue.subtract(c.getPrice());
        c.setTotalItemValue(totalItemValue);
        c.setValueDiff(valueDiff);
        c.setTotalValueIncomplete(totalIncomplete);
        if (totalItemValue.compareTo(BigDecimal.ZERO) > 0) {
            c.setValueDiffPct(valueDiff.divide(totalItemValue, 6, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100)));
        }

        return c;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void backfill() {
        backfillRigFlags();
        backfillTotalItemValues();
    }

    private void backfillRigFlags() {
        Set<Integer> groupIds = contractItemRepository.findDistinctGroupIdsWithNullIsRig();
        if (groupIds.isEmpty()) return;
        log.info("Backfilling is_rig for {} distinct group IDs", groupIds.size());
        Set<Integer> rigGroupIds = esiService.resolveRigGroupIds(groupIds);
        if (!rigGroupIds.isEmpty()) contractItemRepository.markAsRig(rigGroupIds);
        contractItemRepository.markNonRigRemaining();
        log.info("is_rig backfill complete — {} rig group(s)", rigGroupIds.size());
    }

    private void backfillTotalItemValues() {
        List<Contract> contracts = contractRepository.findByValueDiffIsNull(Instant.now());
        if (contracts.isEmpty()) return;
        log.info("Backfilling totalItemValue for {} existing contracts", contracts.size());

        Map<Integer, BigDecimal> universePrices = esiService.fetchAveragePrices();
        List<Long> ids = contracts.stream().map(Contract::getContractId).toList();
        Map<Long, List<ContractItem>> itemsByContract = contractItemRepository.findByContractIdIn(ids)
                .stream().collect(Collectors.groupingBy(ContractItem::getContractId));

        for (Contract c : contracts) {
            List<ContractItem> items = itemsByContract.getOrDefault(c.getContractId(), List.of());
            BigDecimal total = BigDecimal.ZERO;
            boolean incomplete = false;
            for (ContractItem item : items) {
                BigDecimal unitPrice = universePrices.get(item.getTypeId());
                if (unitPrice != null) {
                    int qty = item.getQuantity() != null ? item.getQuantity() : 1;
                    total = total.add(unitPrice.multiply(BigDecimal.valueOf(qty)));
                } else {
                    incomplete = true;
                }
            }
            BigDecimal diff = total.subtract(c.getPrice());
            c.setTotalItemValue(total);
            c.setValueDiff(diff);
            c.setTotalValueIncomplete(incomplete);
            if (total.compareTo(BigDecimal.ZERO) > 0) {
                c.setValueDiffPct(diff.divide(total, 6, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100)));
            }
        }
        contractRepository.saveAll(contracts);
        log.info("totalItemValue backfill complete");
    }

    public void pruneExpiredContracts() {
        contractRepository.deleteByDateExpiredBefore(Instant.now());
    }
}
