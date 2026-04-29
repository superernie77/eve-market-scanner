package com.evemarket.backend.controller;

import com.evemarket.backend.dto.CapitalContractDto;
import com.evemarket.backend.dto.CapitalContractItemDto;
import com.evemarket.backend.model.Contract;
import com.evemarket.backend.model.ContractItem;
import com.evemarket.backend.repository.ContractItemRepository;
import com.evemarket.backend.repository.ContractRepository;
import com.evemarket.backend.service.ContractScannerService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/contracts")
@RequiredArgsConstructor
public class ContractController {

    private static final Map<Integer, String> REGION_NAMES = Map.of(
            10000001, "Derelik",
            10000043, "Domain"
    );

    private static final List<String> SORTABLE_FIELDS = List.of(
            "effectivePricePerUnit", "effectiveCapitalPrice", "price",
            "nonCapItemValue", "dateExpired", "capitalTypeName"
    );

    private final ContractRepository contractRepository;
    private final ContractItemRepository contractItemRepository;
    private final ContractScannerService contractScannerService;

    @GetMapping("/capitals")
    public Page<CapitalContractDto> getCapitalContracts(
            @RequestParam(required = false) Integer regionId,
            @RequestParam(required = false) Integer capitalTypeId,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "false") boolean priceCompleteOnly,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(defaultValue = "effectivePricePerUnit") String sortBy,
            @RequestParam(defaultValue = "asc") String sortDir) {

        Sort.Direction dir = "desc".equalsIgnoreCase(sortDir) ? Sort.Direction.DESC : Sort.Direction.ASC;
        String field = SORTABLE_FIELDS.contains(sortBy) ? sortBy : "effectivePricePerUnit";
        PageRequest pageable = PageRequest.of(page, size, Sort.by(dir, field));

        Page<Contract> contracts = contractRepository.findActiveContracts(
                Instant.now(), regionId, capitalTypeId, maxPrice, priceCompleteOnly, pageable);

        List<Long> contractIds = contracts.stream().map(Contract::getContractId).toList();
        Map<Long, List<ContractItem>> itemsByContractId = contractItemRepository
                .findByContractIdIn(contractIds).stream()
                .collect(Collectors.groupingBy(ContractItem::getContractId));

        return contracts.map(c -> toDto(c, itemsByContractId.getOrDefault(c.getContractId(), List.of())));
    }

    @PostMapping("/scan")
    public ResponseEntity<Map<String, String>> triggerScan() {
        new Thread(contractScannerService::scan).start();
        return ResponseEntity.accepted().body(Map.of("status", "contract scan triggered"));
    }

    @PostMapping("/reset")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Map<String, String>> resetContracts() {
        contractItemRepository.deleteAll();
        contractRepository.deleteAll();
        return ResponseEntity.ok(Map.of("status", "contracts cleared — trigger a scan to re-index"));
    }

    private CapitalContractDto toDto(Contract c, List<ContractItem> items) {
        CapitalContractDto dto = new CapitalContractDto();
        dto.setContractId(c.getContractId());
        dto.setRegionId(c.getRegionId());
        dto.setRegionName(REGION_NAMES.getOrDefault(c.getRegionId(), "Region " + c.getRegionId()));
        dto.setIssuerId(c.getIssuerId());
        dto.setStartLocationId(c.getStartLocationId());
        dto.setStartLocationName(c.getStartLocationName());
        dto.setPrice(c.getPrice());
        dto.setDateIssued(c.getDateIssued());
        dto.setDateExpired(c.getDateExpired());
        dto.setTitle(c.getTitle());
        dto.setCapitalTypeId(c.getCapitalTypeId());
        dto.setCapitalTypeName(c.getCapitalTypeName());
        dto.setCapitalGroupName(c.getCapitalGroupName());
        dto.setCapitalQuantity(c.getCapitalQuantity());
        dto.setHasMixedCapitals(c.getHasMixedCapitals());
        dto.setNonCapItemValue(c.getNonCapItemValue());
        dto.setEffectiveCapitalPrice(c.getEffectiveCapitalPrice());
        dto.setEffectivePricePerUnit(c.getEffectivePricePerUnit());
        dto.setPriceIncomplete(c.getPriceIncomplete());
        dto.setUnknownPriceItemCount(c.getUnknownPriceItemCount());
        dto.setItems(items.stream().map(this::toItemDto).toList());
        return dto;
    }

    private CapitalContractItemDto toItemDto(ContractItem ci) {
        CapitalContractItemDto dto = new CapitalContractItemDto();
        dto.setTypeId(ci.getTypeId());
        dto.setTypeName(ci.getTypeName());
        dto.setQuantity(ci.getQuantity());
        dto.setIsCapital(ci.getIsCapital());
        dto.setEstimatedValue(ci.getEstimatedValue());
        return dto;
    }
}
