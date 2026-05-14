package com.evemarket.backend.service;

import com.evemarket.backend.dto.EsiContractDto;
import com.evemarket.backend.dto.EsiContractItemDto;
import com.evemarket.backend.dto.EsiMarketOrderDto;
import com.evemarket.backend.model.ItemType;
import com.evemarket.backend.repository.ItemTypeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class EsiService {

    private final WebClient esiWebClient;
    private final ItemTypeRepository itemTypeRepository;

    // ESI allows up to 1000 IDs per /universe/names/ call
    private static final int NAMES_BATCH_SIZE = 1000;

    public List<EsiMarketOrderDto> fetchSellOrders(int regionId) {
        return fetchAllPages(regionId, "sell");
    }

    private List<EsiMarketOrderDto> fetchAllPages(int regionId, String orderType) {
        var firstResponse = esiWebClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/markets/{regionId}/orders/")
                        .queryParam("order_type", orderType)
                        .queryParam("page", 1)
                        .build(regionId))
                .retrieve()
                .toEntityList(EsiMarketOrderDto.class)
                .block();

        if (firstResponse == null || firstResponse.getBody() == null) {
            return List.of();
        }

        List<EsiMarketOrderDto> allOrders = new ArrayList<>(firstResponse.getBody());

        String pagesHeader = firstResponse.getHeaders().getFirst("X-Pages");
        int totalPages = pagesHeader != null ? Integer.parseInt(pagesHeader) : 1;

        if (totalPages > 1) {
            List<EsiMarketOrderDto> remaining = Flux.range(2, totalPages - 1)
                    .flatMap(page -> esiWebClient.get()
                            .uri(uriBuilder -> uriBuilder
                                    .path("/markets/{regionId}/orders/")
                                    .queryParam("order_type", orderType)
                                    .queryParam("page", page)
                                    .build(regionId))
                            .retrieve()
                            .bodyToFlux(EsiMarketOrderDto.class)
                            .onErrorResume(WebClientResponseException.class, e -> {
                                log.warn("ESI error on page {}: {}", page, e.getMessage());
                                return Flux.empty();
                            }), 5)
                    .collectList()
                    .block();
            if (remaining != null) {
                allOrders.addAll(remaining);
            }
        }

        log.info("Fetched {} {} orders for region {}", allOrders.size(), orderType, regionId);
        return allOrders;
    }

    @SuppressWarnings("unchecked")
    public Map<Integer, BigDecimal> fetchAveragePrices() {
        List<Map<String, Object>> prices = esiWebClient.get()
                .uri("/markets/prices/")
                .retrieve()
                .bodyToFlux((Class<Map<String, Object>>) (Class<?>) Map.class)
                .collectList()
                .block();

        if (prices == null) return Map.of();

        Map<Integer, BigDecimal> result = new HashMap<>();
        for (var entry : prices) {
            Object typeIdObj = entry.get("type_id");
            Object avgPriceObj = entry.get("average_price");
            if (typeIdObj instanceof Number typeId && avgPriceObj instanceof Number avgPrice) {
                result.put(typeId.intValue(), BigDecimal.valueOf(avgPrice.doubleValue()));
            }
        }
        return result;
    }

    /**
     * Batch-resolve type names for a set of type IDs.
     * Loads known names from DB in one query, fetches missing ones from ESI in batches,
     * then persists new entries. Runs in its own transaction so it doesn't interfere
     * with the caller's transaction.
     */
    @Transactional
    public Map<Integer, String> resolveTypeNamesBatch(Set<Integer> typeIds) {
        if (typeIds.isEmpty()) return Map.of();

        // Single bulk DB lookup
        Map<Integer, String> result = new HashMap<>();
        itemTypeRepository.findAllById(typeIds)
                .forEach(it -> result.put(it.getTypeId(), it.getName()));

        Set<Integer> missing = typeIds.stream()
                .filter(id -> !result.containsKey(id))
                .collect(Collectors.toSet());

        if (missing.isEmpty()) return result;

        log.info("Resolving {} unknown type names from ESI", missing.size());

        // Batch fetch from ESI /universe/names/ (max 1000 IDs per call)
        List<Integer> missingList = new ArrayList<>(missing);
        List<ItemType> toSave = new ArrayList<>();

        for (int i = 0; i < missingList.size(); i += NAMES_BATCH_SIZE) {
            List<Integer> batch = missingList.subList(i, Math.min(i + NAMES_BATCH_SIZE, missingList.size()));
            try {
                fetchNamesFromEsi(batch, result, toSave);
            } catch (Exception e) {
                log.warn("ESI /universe/names/ batch failed: {}", e.getMessage());
                // Fall back to placeholder names for this batch
                batch.forEach(id -> result.putIfAbsent(id, "Unknown #" + id));
            }
        }

        // Persist all new names in one saveAll
        if (!toSave.isEmpty()) {
            itemTypeRepository.saveAll(toSave);
        }

        return result;
    }

    // ── System name resolution ────────────────────────────────────────────────

    /**
     * Batch-resolve solar system names for a set of system IDs.
     * Uses the same /universe/names/ endpoint (supports solar_system category).
     * Results are not persisted — systems are few enough to cache in-memory per scan.
     */
    public Map<Long, String> resolveSystemNamesBatch(Set<Long> systemIds) {
        if (systemIds.isEmpty()) return Map.of();

        Map<Long, String> result = new HashMap<>();
        List<Long> idList = new ArrayList<>(systemIds);

        for (int i = 0; i < idList.size(); i += NAMES_BATCH_SIZE) {
            List<Long> batch = idList.subList(i, Math.min(i + NAMES_BATCH_SIZE, idList.size()));
            try {
                fetchSystemNamesFromEsi(batch, result);
            } catch (Exception e) {
                log.warn("ESI /universe/names/ failed for system batch: {}", e.getMessage());
                batch.forEach(id -> result.putIfAbsent(id, "Unknown #" + id));
            }
        }
        return result;
    }

    public record LocationResolution(String stationName, String systemName) {}

    /**
     * Resolves contract start-location IDs to station name + solar system name.
     * NPC stations (60_000_000–67_999_999) → GET /universe/stations/{id}/ then POST /universe/names/ for system IDs.
     * Everything else (player structures, etc.) → falls back to "Unknown #id"
     */
    @SuppressWarnings("unchecked")
    public Map<Long, LocationResolution> resolveLocationNamesBatch(Set<Long> locationIds) {
        if (locationIds.isEmpty()) return Map.of();

        Map<Long, String> stationNames = new ConcurrentHashMap<>();
        Map<Long, Long>   stationToSystem = new ConcurrentHashMap<>();

        List<Mono<Void>> tasks = locationIds.stream()
                .map(id -> {
                    if (id >= 60_000_000L && id <= 67_999_999L) {
                        return esiWebClient.get()
                                .uri("/universe/stations/{id}/", id)
                                .retrieve()
                                .bodyToMono(Map.class)
                                .doOnNext(body -> {
                                    Object name = body.get("name");
                                    if (name instanceof String s) stationNames.put(id, s);
                                    Object sysId = body.get("system_id");
                                    if (sysId instanceof Number n) stationToSystem.put(id, n.longValue());
                                })
                                .onErrorResume(e -> {
                                    log.warn("Could not resolve station {}: {}", id, e.getMessage());
                                    stationNames.put(id, "Unknown #" + id);
                                    return Mono.<Map>empty();
                                })
                                .then();
                    } else {
                        stationNames.put(id, "Unknown Structure #" + id);
                        return Mono.<Void>empty();
                    }
                })
                .toList();

        Flux.merge(tasks).blockLast();

        // Batch-resolve system IDs → system names
        Map<Long, String> systemNames = new HashMap<>();
        List<Long> systemIds = new ArrayList<>(new HashSet<>(stationToSystem.values()));
        if (!systemIds.isEmpty()) {
            fetchSystemNamesFromEsi(systemIds, systemNames);
        }

        Map<Long, LocationResolution> result = new HashMap<>();
        for (Long locId : locationIds) {
            String stName = stationNames.getOrDefault(locId, "Unknown #" + locId);
            Long sysId = stationToSystem.get(locId);
            String sysName = sysId != null ? systemNames.getOrDefault(sysId, null) : null;
            result.put(locId, new LocationResolution(stName, sysName));
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private void fetchSystemNamesFromEsi(List<Long> ids, Map<Long, String> result) {
        List<Map<String, Object>> names = esiWebClient.post()
                .uri("/universe/names/")
                .bodyValue(ids)
                .retrieve()
                .bodyToFlux((Class<Map<String, Object>>) (Class<?>) Map.class)
                .collectList()
                .block();

        if (names == null) return;
        for (var entry : names) {
            Object idObj = entry.get("id");
            Object nameObj = entry.get("name");
            if (idObj instanceof Number id && nameObj instanceof String name) {
                result.put(id.longValue(), name);
            }
        }
    }

    // ── Category enrichment ───────────────────────────────────────────────────

    /**
     * Background enrichment: fills in groupId/groupName/categoryId/categoryName
     * for all ItemType records that are missing category data.
     * Runs after each market scan; ESI calls are made in parallel (max 10 concurrent).
     */
    public void enrichTypeCategories() {
        List<ItemType> unenriched = itemTypeRepository.findByCategoryNameIsNull();
        if (unenriched.isEmpty()) {
            log.debug("All item types already have category info");
            return;
        }
        log.info("Enriching {} item types with category info", unenriched.size());

        // Step 1: fetch group_id for each unenriched type (parallel, max 10)
        Map<Integer, Integer> typeToGroupId = new ConcurrentHashMap<>();
        Flux.fromIterable(unenriched)
                .flatMap(t -> fetchTypeData(t.getTypeId())
                        .map(td -> Map.entry(t.getTypeId(), td.groupId()))
                        .<Map.Entry<Integer, Integer>>onErrorResume(e -> Mono.empty()), 10)
                .toStream()
                .forEach(e -> typeToGroupId.put(e.getKey(), e.getValue()));

        // Step 2: fetch group info (name + category_id) for unique groups
        Set<Integer> uniqueGroupIds = new HashSet<>(typeToGroupId.values());
        Map<Integer, GroupInfo> groupInfoMap = new ConcurrentHashMap<>();
        Flux.fromIterable(uniqueGroupIds)
                .flatMap(gid -> fetchGroupInfo(gid).onErrorResume(e -> Mono.empty()), 10)
                .toStream()
                .forEach(g -> groupInfoMap.put(g.groupId(), g));

        // Step 3: fetch category names for unique categories
        Set<Integer> uniqueCategoryIds = groupInfoMap.values().stream()
                .map(GroupInfo::categoryId).collect(Collectors.toSet());
        Map<Integer, String> categoryNames = new ConcurrentHashMap<>();
        Flux.fromIterable(uniqueCategoryIds)
                .flatMap(cid -> fetchCategoryName(cid)
                        .map(name -> Map.entry(cid, name))
                        .onErrorResume(e -> Mono.empty()), 5)
                .toStream()
                .forEach(e -> categoryNames.put(e.getKey(), e.getValue()));

        // Step 4: update and save
        List<ItemType> toUpdate = unenriched.stream()
                .filter(t -> typeToGroupId.containsKey(t.getTypeId()))
                .peek(t -> {
                    int gid = typeToGroupId.get(t.getTypeId());
                    GroupInfo g = groupInfoMap.get(gid);
                    if (g != null) {
                        t.setGroupId(gid);
                        t.setGroupName(g.groupName());
                        t.setCategoryId(g.categoryId());
                        t.setCategoryName(categoryNames.getOrDefault(g.categoryId(), "Unknown"));
                    }
                })
                .filter(t -> t.getCategoryName() != null)
                .toList();

        if (!toUpdate.isEmpty()) {
            saveEnrichedTypes(toUpdate);
            log.info("Enriched {} item types with category info", toUpdate.size());
        }
    }

    /**
     * Returns the subset of the given group IDs that belong to the Rig category (ID 66).
     * Fetches group info from ESI in parallel; unknown groups are silently skipped.
     */
    public Set<Integer> resolveRigGroupIds(Set<Integer> groupIds) {
        if (groupIds.isEmpty()) return Set.of();
        Set<Integer> rigGroups = ConcurrentHashMap.newKeySet();
        Flux.fromIterable(groupIds)
                .flatMap(gid -> fetchGroupInfo(gid)
                        .filter(g -> g.groupName().startsWith("Rig"))
                        .map(GroupInfo::groupId)
                        .onErrorResume(e -> Mono.empty()), 10)
                .toStream()
                .forEach(rigGroups::add);
        return rigGroups;
    }

    @Transactional
    public void saveEnrichedTypes(List<ItemType> types) {
        itemTypeRepository.saveAll(types);
    }

    private record TypeData(int groupId, BigDecimal packagedVolume) {}

    @SuppressWarnings("unchecked")
    private Mono<TypeData> fetchTypeData(int typeId) {
        return esiWebClient.get()
                .uri("/universe/types/{typeId}/", typeId)
                .retrieve()
                .bodyToMono((Class<Map<String, Object>>) (Class<?>) Map.class)
                .map(m -> {
                    int gid = ((Number) m.get("group_id")).intValue();
                    Number vol = (Number) m.get("packaged_volume");
                    return new TypeData(gid, vol != null ? new BigDecimal(vol.toString()) : null);
                });
    }

    @SuppressWarnings("unchecked")
    private Mono<GroupInfo> fetchGroupInfo(int groupId) {
        return esiWebClient.get()
                .uri("/universe/groups/{groupId}/", groupId)
                .retrieve()
                .bodyToMono((Class<Map<String, Object>>) (Class<?>) Map.class)
                .map(m -> new GroupInfo(groupId, (String) m.get("name"),
                        ((Number) m.get("category_id")).intValue()));
    }

    @SuppressWarnings("unchecked")
    private Mono<String> fetchCategoryName(int categoryId) {
        return esiWebClient.get()
                .uri("/universe/categories/{categoryId}/", categoryId)
                .retrieve()
                .bodyToMono((Class<Map<String, Object>>) (Class<?>) Map.class)
                .map(m -> (String) m.get("name"));
    }

    private record GroupInfo(int groupId, String groupName, int categoryId) {}

    // ── Contracts ─────────────────────────────────────────────────────────────

    public List<EsiContractDto> fetchContracts(int regionId) {
        var firstResponse = esiWebClient.get()
                .uri(uriBuilder -> uriBuilder
                        .path("/contracts/public/{regionId}/")
                        .queryParam("page", 1)
                        .build(regionId))
                .retrieve()
                .toEntityList(EsiContractDto.class)
                .onErrorResume(WebClientResponseException.class, e -> {
                    log.warn("ESI contracts error for region {}: {}", regionId, e.getMessage());
                    return Mono.empty();
                })
                .block();

        if (firstResponse == null || firstResponse.getBody() == null) return List.of();

        List<EsiContractDto> all = new ArrayList<>(firstResponse.getBody());
        String pagesHeader = firstResponse.getHeaders().getFirst("X-Pages");
        int totalPages = pagesHeader != null ? Integer.parseInt(pagesHeader) : 1;

        if (totalPages > 1) {
            List<EsiContractDto> remaining = Flux.range(2, totalPages - 1)
                    .flatMap(page -> esiWebClient.get()
                            .uri(uriBuilder -> uriBuilder
                                    .path("/contracts/public/{regionId}/")
                                    .queryParam("page", page)
                                    .build(regionId))
                            .retrieve()
                            .bodyToFlux(EsiContractDto.class)
                            .onErrorResume(WebClientResponseException.class, e -> {
                                log.warn("ESI contracts page {} error: {}", page, e.getMessage());
                                return Flux.empty();
                            }), 5)
                    .collectList()
                    .block();
            if (remaining != null) all.addAll(remaining);
        }

        log.info("Fetched {} contracts for region {}", all.size(), regionId);
        return all;
    }

    @SuppressWarnings("unchecked")
    public Map<Long, List<EsiContractItemDto>> fetchContractItemsBulk(List<Long> contractIds) {
        Map<Long, List<EsiContractItemDto>> result = new ConcurrentHashMap<>();
        Flux.fromIterable(contractIds)
                .flatMap(id -> esiWebClient.get()
                        .uri("/contracts/public/items/{contractId}/", id)
                        .retrieve()
                        .bodyToFlux(EsiContractItemDto.class)
                        .collectList()
                        .map(items -> Map.entry(id, items))
                        .onErrorResume(e -> {
                            if (e instanceof WebClientResponseException wce && wce.getStatusCode().value() == 403) {
                                // 403 = contract no longer available (taken/expired between list and item fetch)
                                return Mono.empty();
                            }
                            log.warn("Failed to fetch items for contract {}: {}", id, e.getMessage());
                            return Mono.empty();
                        }), 10)
                .toStream()
                .forEach(e -> result.put(e.getKey(), e.getValue()));
        return result;
    }

    // ── Group ID resolution ───────────────────────────────────────────────────

    @Transactional
    public Map<Integer, Integer> resolveGroupIdsBatch(Set<Integer> typeIds) {
        if (typeIds.isEmpty()) return Map.of();

        Map<Integer, Integer> result = new HashMap<>();
        List<ItemType> cached = itemTypeRepository.findAllById(typeIds);
        cached.stream()
                .filter(it -> it.getGroupId() != null)
                .forEach(it -> result.put(it.getTypeId(), it.getGroupId()));

        // Fetch from ESI: types not in cache at all, or in cache but missing packagedVolume
        Set<Integer> cachedIds = cached.stream().map(ItemType::getTypeId).collect(Collectors.toSet());
        Set<Integer> needsVolume = cached.stream()
                .filter(it -> it.getGroupId() != null && it.getPackagedVolume() == null)
                .map(ItemType::getTypeId)
                .collect(Collectors.toSet());
        Set<Integer> missing = new HashSet<>(typeIds);
        missing.removeAll(result.keySet());
        missing.addAll(needsVolume);

        if (missing.isEmpty()) return result;

        log.debug("Resolving {} type(s) from ESI (missing groupId or packagedVolume)", missing.size());
        Map<Integer, TypeData> fetched = new ConcurrentHashMap<>();
        Flux.fromIterable(missing)
                .flatMap(id -> fetchTypeData(id)
                        .map(td -> Map.entry(id, td))
                        .onErrorResume(e -> Mono.empty()), 10)
                .toStream()
                .forEach(e -> fetched.put(e.getKey(), e.getValue()));

        fetched.forEach((id, td) -> result.put(id, td.groupId()));

        if (!fetched.isEmpty()) {
            List<ItemType> toUpdate = itemTypeRepository.findAllById(fetched.keySet()).stream()
                    .filter(it -> it.getGroupId() == null || it.getPackagedVolume() == null)
                    .peek(it -> {
                        TypeData td = fetched.get(it.getTypeId());
                        if (td != null) {
                            it.setGroupId(td.groupId());
                            it.setPackagedVolume(td.packagedVolume());
                        }
                    })
                    .toList();
            if (!toUpdate.isEmpty()) itemTypeRepository.saveAll(toUpdate);
        }

        return result;
    }

    /**
     * Returns packaged volume (m³) per typeId, read from the ItemType cache.
     * Call after resolveGroupIdsBatch so the cache is warm.
     */
    public Map<Integer, BigDecimal> resolvePackagedVolumesBatch(Set<Integer> typeIds) {
        if (typeIds.isEmpty()) return Map.of();
        Map<Integer, BigDecimal> result = new HashMap<>();
        itemTypeRepository.findAllById(typeIds)
                .forEach(it -> { if (it.getPackagedVolume() != null) result.put(it.getTypeId(), it.getPackagedVolume()); });
        return result;
    }

    @SuppressWarnings("unchecked")
    private void fetchNamesFromEsi(List<Integer> ids, Map<Integer, String> result, List<ItemType> toSave) {
        List<Map<String, Object>> names = esiWebClient.post()
                .uri("/universe/names/")
                .bodyValue(ids)
                .retrieve()
                .bodyToFlux((Class<Map<String, Object>>) (Class<?>) Map.class)
                .collectList()
                .block();

        if (names == null) return;

        Instant now = Instant.now();
        for (var entry : names) {
            Object idObj = entry.get("id");
            Object nameObj = entry.get("name");
            if (idObj instanceof Number id && nameObj instanceof String name) {
                result.put(id.intValue(), name);

                ItemType it = new ItemType();
                it.setTypeId(id.intValue());
                it.setName(name);
                it.setLastUpdated(now);
                toSave.add(it);
            }
        }
    }
}
