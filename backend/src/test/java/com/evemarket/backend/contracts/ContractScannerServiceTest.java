package com.evemarket.backend.contracts;

import com.evemarket.backend.dto.EsiContractDto;
import com.evemarket.backend.dto.EsiContractItemDto;
import com.evemarket.backend.model.Contract;
import com.evemarket.backend.model.ContractItem;
import com.evemarket.backend.repository.ContractRepository;
import com.evemarket.backend.service.ContractPersistenceService;
import com.evemarket.backend.service.ContractScannerService;
import com.evemarket.backend.service.EsiService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ContractScannerServiceTest {

    // EVE type IDs used across tests
    private static final int THANATOS_TYPE_ID  = 23911; // Carrier
    private static final int ARCHON_TYPE_ID    = 23757; // Carrier
    private static final int PHOENIX_TYPE_ID   = 19724; // Dreadnought
    private static final int TRITANIUM_TYPE_ID = 34;    // Mineral
    private static final int MODULE_TYPE_ID    = 3756;  // Non-capital module

    private static final int GROUP_CARRIER     = 547;
    private static final int GROUP_DREADNOUGHT = 485;
    private static final int GROUP_MINERAL     = 18;
    private static final int GROUP_MODULE      = 55;

    private static final int REGION_DERELIK = 10000001;

    @Mock EsiService esiService;
    @Mock ContractRepository contractRepository;
    @Mock ContractPersistenceService contractPersistenceService;

    ContractScannerService service;

    @BeforeEach
    void setUp() {
        service = new ContractScannerService(esiService, contractRepository, contractPersistenceService);
        ReflectionTestUtils.setField(service, "enabled",       true);
        ReflectionTestUtils.setField(service, "regionIds",     List.of(REGION_DERELIK));
        ReflectionTestUtils.setField(service, "capitalGroupIds",
                Set.of(30, 485, 547, 659, 883, 1538, 902));

        // Default stubs — overridden per test as needed
        when(contractRepository.findContractIdsByRegionId(anyInt())).thenReturn(Set.of());
        when(esiService.fetchAveragePrices()).thenReturn(Map.of());
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of());
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of());
    }

    // ── Helper builders ───────────────────────────────────────────────────────

    private EsiContractDto contractDto(long contractId, BigDecimal price, Instant expires) {
        EsiContractDto dto = new EsiContractDto();
        dto.setContractId(contractId);
        dto.setIssuerId(90000001L);
        dto.setIssuerCorporationId(1000001L);
        dto.setType("item_exchange");
        dto.setStartLocationId(60000004L);
        dto.setPrice(price);
        dto.setDateIssued(Instant.now().minus(1, ChronoUnit.DAYS));
        dto.setDateExpired(expires);
        dto.setTitle("");
        return dto;
    }

    private EsiContractItemDto itemDto(long recordId, int typeId, int quantity) {
        EsiContractItemDto dto = new EsiContractItemDto();
        dto.setRecordId(recordId);
        dto.setTypeId(typeId);
        dto.setQuantity(quantity);
        dto.setIsIncluded(true);
        dto.setIsSingleton(false);
        return dto;
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    @Test
    void whenContractHasOnlyCapital_effectivePriceEqualsContractPrice() {
        BigDecimal price = bd("5000000000"); // 5B ISK
        EsiContractDto contract = contractDto(1L, price, future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(1L)))
                .thenReturn(Map.of(1L, List.of(itemDto(10L, THANATOS_TYPE_ID, 1))));
        when(esiService.resolveTypeNamesBatch(Set.of(THANATOS_TYPE_ID)))
                .thenReturn(Map.of(THANATOS_TYPE_ID, "Thanatos"));
        when(esiService.resolveGroupIdsBatch(Set.of(THANATOS_TYPE_ID)))
                .thenReturn(Map.of(THANATOS_TYPE_ID, GROUP_CARRIER));

        service.scan();

        Contract saved = captureFirstContract();
        assertThat(saved.getEffectiveCapitalPrice()).isEqualByComparingTo(price);
        assertThat(saved.getNonCapItemValue()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(saved.getPriceIncomplete()).isFalse();
        assertThat(saved.getCapitalTypeName()).isEqualTo("Thanatos");
        assertThat(saved.getCapitalGroupName()).isEqualTo("Carrier");
        assertThat(saved.getCapitalQuantity()).isEqualTo(1);
    }

    @Test
    void whenContractHasExtrasWithKnownPrices_effectivePriceSubtractsExtrasValue() {
        BigDecimal price = bd("5000000000"); // 5B ISK
        EsiContractDto contract = contractDto(2L, price, future());

        // 1 Thanatos + 1000 Tritanium (34 ISK each) + 5 modules (1M each)
        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(2L))).thenReturn(Map.of(2L, List.of(
                itemDto(20L, THANATOS_TYPE_ID, 1),
                itemDto(21L, TRITANIUM_TYPE_ID, 1000),
                itemDto(22L, MODULE_TYPE_ID,    5)
        )));
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID,  "Thanatos",
                TRITANIUM_TYPE_ID, "Tritanium",
                MODULE_TYPE_ID,    "200mm AutoCannon"
        ));
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID,  GROUP_CARRIER,
                TRITANIUM_TYPE_ID, GROUP_MINERAL,
                MODULE_TYPE_ID,    GROUP_MODULE
        ));
        when(esiService.fetchAveragePrices()).thenReturn(Map.of(
                TRITANIUM_TYPE_ID, bd("34"),       // 1000 × 34 = 34,000
                MODULE_TYPE_ID,    bd("1000000")   // 5 × 1,000,000 = 5,000,000
        ));

        service.scan();

        // nonCapItemValue = 34,000 + 5,000,000 = 5,034,000
        // effectiveCapitalPrice = 5,000,000,000 - 5,034,000 = 4,994,966,000
        Contract saved = captureFirstContract();
        assertThat(saved.getNonCapItemValue()).isEqualByComparingTo(bd("5034000"));
        assertThat(saved.getEffectiveCapitalPrice()).isEqualByComparingTo(bd("4994966000"));
        assertThat(saved.getPriceIncomplete()).isFalse();
        assertThat(saved.getUnknownPriceItemCount()).isEqualTo(0);
    }

    @Test
    void whenExtraItemHasNoUniversePrice_contractMarkedIncomplete() {
        EsiContractDto contract = contractDto(3L, bd("3000000000"), future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(3L))).thenReturn(Map.of(3L, List.of(
                itemDto(30L, THANATOS_TYPE_ID, 1),
                itemDto(31L, MODULE_TYPE_ID,   10) // no universe price
        )));
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID, "Thanatos",
                MODULE_TYPE_ID,   "Some Module"
        ));
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID, GROUP_CARRIER,
                MODULE_TYPE_ID,   GROUP_MODULE
        ));
        // fetchAveragePrices returns empty → no price for MODULE_TYPE_ID

        service.scan();

        Contract saved = captureFirstContract();
        assertThat(saved.getPriceIncomplete()).isTrue();
        assertThat(saved.getUnknownPriceItemCount()).isEqualTo(1);
    }

    @Test
    void whenContractHasNoCapitals_nothingIsPersisted() {
        EsiContractDto contract = contractDto(4L, bd("100000000"), future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(4L))).thenReturn(Map.of(4L, List.of(
                itemDto(40L, TRITANIUM_TYPE_ID, 1000),
                itemDto(41L, MODULE_TYPE_ID,    5)
        )));
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of(
                TRITANIUM_TYPE_ID, "Tritanium",
                MODULE_TYPE_ID,    "Some Module"
        ));
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of(
                TRITANIUM_TYPE_ID, GROUP_MINERAL,
                MODULE_TYPE_ID,    GROUP_MODULE
        ));

        service.scan();

        verify(contractPersistenceService, never()).saveAll(any(), any());
    }

    @Test
    void whenContractIsExpired_itIsSkipped() {
        Instant expired = Instant.now().minus(1, ChronoUnit.HOURS);
        EsiContractDto contract = contractDto(5L, bd("5000000000"), expired);

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));

        service.scan();

        verify(esiService, never()).fetchContractItemsBulk(any());
        verify(contractPersistenceService, never()).saveAll(any(), any());
    }

    @Test
    void whenContractIsAuction_itIsSkipped() {
        EsiContractDto contract = contractDto(6L, bd("5000000000"), future());
        contract.setType("auction");

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));

        service.scan();

        verify(esiService, never()).fetchContractItemsBulk(any());
        verify(contractPersistenceService, never()).saveAll(any(), any());
    }

    @Test
    void whenContractAlreadyIndexed_itIsSkipped() {
        EsiContractDto contract = contractDto(7L, bd("5000000000"), future());
        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(contractRepository.findContractIdsByRegionId(REGION_DERELIK)).thenReturn(Set.of(7L));

        service.scan();

        verify(esiService, never()).fetchContractItemsBulk(any());
        verify(contractPersistenceService, never()).saveAll(any(), any());
    }

    @Test
    void whenContractHasMultipleSameTypeCapitals_capitalQuantityAndPerUnitPriceCorrect() {
        BigDecimal price = bd("10000000000"); // 10B
        EsiContractDto contract = contractDto(8L, price, future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(8L))).thenReturn(Map.of(8L, List.of(
                itemDto(80L, ARCHON_TYPE_ID, 2)  // 2× Archon (same type)
        )));
        when(esiService.resolveTypeNamesBatch(any()))
                .thenReturn(Map.of(ARCHON_TYPE_ID, "Archon"));
        when(esiService.resolveGroupIdsBatch(any()))
                .thenReturn(Map.of(ARCHON_TYPE_ID, GROUP_CARRIER));

        service.scan();

        Contract saved = captureFirstContract();
        assertThat(saved.getCapitalQuantity()).isEqualTo(2);
        assertThat(saved.getHasMixedCapitals()).isFalse();
        // effectivePricePerUnit = 10B / 2 = 5B
        assertThat(saved.getEffectivePricePerUnit()).isEqualByComparingTo(bd("5000000000"));
    }

    @Test
    void whenContractHasMixedCapitalTypes_markedAsMixedAndPerUnitIsTotal() {
        BigDecimal price = bd("8000000000"); // 8B
        EsiContractDto contract = contractDto(9L, price, future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(9L))).thenReturn(Map.of(9L, List.of(
                itemDto(90L, THANATOS_TYPE_ID, 1),  // Carrier
                itemDto(91L, PHOENIX_TYPE_ID,  1)   // Dreadnought
        )));
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID, "Thanatos",
                PHOENIX_TYPE_ID,  "Phoenix"
        ));
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID, GROUP_CARRIER,
                PHOENIX_TYPE_ID,  GROUP_DREADNOUGHT
        ));

        service.scan();

        Contract saved = captureFirstContract();
        assertThat(saved.getHasMixedCapitals()).isTrue();
        assertThat(saved.getCapitalQuantity()).isEqualTo(2);
        // effectivePricePerUnit = effectiveTotal (no per-unit division when mixed)
        assertThat(saved.getEffectivePricePerUnit()).isEqualByComparingTo(price);
    }

    @Test
    void whenNegativeEffectivePrice_contractIsSavedWithNegativeEffectivePrice() {
        // Extras are worth more than the contract price — "bundle deal"
        BigDecimal price = bd("1000000000"); // 1B ISK
        EsiContractDto contract = contractDto(10L, price, future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(10L))).thenReturn(Map.of(10L, List.of(
                itemDto(100L, THANATOS_TYPE_ID, 1),
                itemDto(101L, MODULE_TYPE_ID,   1000)
        )));
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID, "Thanatos",
                MODULE_TYPE_ID,   "Expensive Module"
        ));
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID, GROUP_CARRIER,
                MODULE_TYPE_ID,   GROUP_MODULE
        ));
        when(esiService.fetchAveragePrices()).thenReturn(Map.of(
                MODULE_TYPE_ID, bd("2000000") // 1000 × 2M = 2B, more than 1B contract price
        ));

        service.scan();

        Contract saved = captureFirstContract();
        assertThat(saved.getEffectiveCapitalPrice()).isNegative();
    }

    @Test
    void savedContractItemsHaveCorrectCapitalFlag() {
        EsiContractDto contract = contractDto(11L, bd("5000000000"), future());

        when(esiService.fetchContracts(REGION_DERELIK)).thenReturn(List.of(contract));
        when(esiService.fetchContractItemsBulk(List.of(11L))).thenReturn(Map.of(11L, List.of(
                itemDto(110L, THANATOS_TYPE_ID,  1),
                itemDto(111L, TRITANIUM_TYPE_ID, 500)
        )));
        when(esiService.resolveTypeNamesBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID,  "Thanatos",
                TRITANIUM_TYPE_ID, "Tritanium"
        ));
        when(esiService.resolveGroupIdsBatch(any())).thenReturn(Map.of(
                THANATOS_TYPE_ID,  GROUP_CARRIER,
                TRITANIUM_TYPE_ID, GROUP_MINERAL
        ));

        service.scan();

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ContractItem>> itemCaptor = ArgumentCaptor.forClass(List.class);
        verify(contractPersistenceService).saveAll(any(), itemCaptor.capture());

        List<ContractItem> items = itemCaptor.getValue();
        assertThat(items).hasSize(2);

        ContractItem cap = items.stream().filter(i -> i.getTypeId().equals(THANATOS_TYPE_ID)).findFirst().orElseThrow();
        ContractItem mineral = items.stream().filter(i -> i.getTypeId().equals(TRITANIUM_TYPE_ID)).findFirst().orElseThrow();

        assertThat(cap.getIsCapital()).isTrue();
        assertThat(mineral.getIsCapital()).isFalse();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Contract captureFirstContract() {
        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<Contract>> captor = ArgumentCaptor.forClass(List.class);
        verify(contractPersistenceService).saveAll(captor.capture(), any());
        List<Contract> saved = captor.getValue();
        assertThat(saved).isNotEmpty();
        return saved.get(0);
    }

    private static Instant future() {
        return Instant.now().plus(7, ChronoUnit.DAYS);
    }

    private static BigDecimal bd(String val) {
        return new BigDecimal(val);
    }
}
