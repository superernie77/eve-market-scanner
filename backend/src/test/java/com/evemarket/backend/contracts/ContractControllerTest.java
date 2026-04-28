package com.evemarket.backend.contracts;

import com.evemarket.backend.controller.ContractController;
import com.evemarket.backend.model.Contract;
import com.evemarket.backend.model.ContractItem;
import com.evemarket.backend.repository.ContractItemRepository;
import com.evemarket.backend.repository.ContractRepository;
import com.evemarket.backend.service.ContractScannerService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
// Spring Boot 3.x serializes Page metadata under $.page.* (not top-level)
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(ContractController.class)
class ContractControllerTest {

    @Autowired MockMvc mockMvc;

    @MockBean ContractRepository contractRepository;
    @MockBean ContractItemRepository contractItemRepository;
    @MockBean ContractScannerService contractScannerService;

    @Test
    void getCapitalContracts_returnsOkWithPageStructure() throws Exception {
        Contract c = sampleContract(1L, 10000001);
        when(contractRepository.findActiveContracts(any(), any(), any(), any(), anyBoolean(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(c)));
        when(contractItemRepository.findByContractIdIn(List.of(1L))).thenReturn(List.of());

        mockMvc.perform(get("/api/contracts/capitals"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.totalElements", is(1)))
                .andExpect(jsonPath("$.content[0].contractId", is(1)))
                .andExpect(jsonPath("$.content[0].capitalTypeName", is("Thanatos")))
                .andExpect(jsonPath("$.content[0].capitalGroupName", is("Carrier")))
                .andExpect(jsonPath("$.content[0].regionName", is("Derelik")))
                .andExpect(jsonPath("$.content[0].priceIncomplete", is(false)))
                .andExpect(jsonPath("$.content[0].items", hasSize(0)));
    }

    @Test
    void getCapitalContracts_includesItemsInResponse() throws Exception {
        Contract c = sampleContract(2L, 10000043);
        ContractItem capItem   = sampleItem(c.getContractId(), 23911, "Thanatos",  1,    true,  null);
        ContractItem extraItem = sampleItem(c.getContractId(), 34,    "Tritanium", 1000, false, new BigDecimal("34000"));

        when(contractRepository.findActiveContracts(any(), any(), any(), any(), anyBoolean(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(c)));
        when(contractItemRepository.findByContractIdIn(List.of(2L))).thenReturn(List.of(capItem, extraItem));

        mockMvc.perform(get("/api/contracts/capitals"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].items", hasSize(2)))
                // first item is the capital (isCapital=true)
                .andExpect(jsonPath("$.content[0].items[0].typeName", is("Thanatos")))
                .andExpect(jsonPath("$.content[0].items[0].isCapital", is(true)))
                // second item is the extra (isCapital=false, has estimatedValue)
                .andExpect(jsonPath("$.content[0].items[1].typeName", is("Tritanium")))
                .andExpect(jsonPath("$.content[0].items[1].isCapital", is(false)))
                .andExpect(jsonPath("$.content[0].items[1].estimatedValue", is(34000)));
    }

    @Test
    void getCapitalContracts_domainRegion_regionNameIsDomain() throws Exception {
        Contract c = sampleContract(3L, 10000043);
        when(contractRepository.findActiveContracts(any(), any(), any(), any(), anyBoolean(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(c)));
        when(contractItemRepository.findByContractIdIn(List.of(3L))).thenReturn(List.of());

        mockMvc.perform(get("/api/contracts/capitals"))
                .andExpect(jsonPath("$.content[0].regionName", is("Domain")));
    }

    @Test
    void getCapitalContracts_emptyResult_returns200WithEmptyPage() throws Exception {
        when(contractRepository.findActiveContracts(any(), any(), any(), any(), anyBoolean(), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        when(contractItemRepository.findByContractIdIn(List.of())).thenReturn(List.of());

        mockMvc.perform(get("/api/contracts/capitals"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page.totalElements", is(0)))
                .andExpect(jsonPath("$.content", hasSize(0)));
    }

    @Test
    void triggerScan_returnsAccepted() throws Exception {
        mockMvc.perform(post("/api/contracts/scan"))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.status", is("contract scan triggered")));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Contract sampleContract(long id, int regionId) {
        Contract c = new Contract();
        c.setContractId(id);
        c.setRegionId(regionId);
        c.setIssuerId(90000001L);
        c.setPrice(new BigDecimal("5000000000"));
        c.setNonCapItemValue(BigDecimal.ZERO);
        c.setEffectiveCapitalPrice(new BigDecimal("5000000000"));
        c.setEffectivePricePerUnit(new BigDecimal("5000000000"));
        c.setPriceIncomplete(false);
        c.setUnknownPriceItemCount(0);
        c.setCapitalTypeId(23911);
        c.setCapitalTypeName("Thanatos");
        c.setCapitalGroupName("Carrier");
        c.setCapitalQuantity(1);
        c.setHasMixedCapitals(false);
        c.setDateIssued(Instant.now().minus(1, ChronoUnit.DAYS));
        c.setDateExpired(Instant.now().plus(7, ChronoUnit.DAYS));
        c.setTitle("");
        c.setDiscoveredAt(Instant.now());
        return c;
    }

    private ContractItem sampleItem(long contractId, int typeId, String typeName,
                                    int quantity, boolean isCapital, BigDecimal estimatedValue) {
        ContractItem item = new ContractItem();
        item.setContractId(contractId);
        item.setTypeId(typeId);
        item.setTypeName(typeName);
        item.setQuantity(quantity);
        item.setIsCapital(isCapital);
        item.setIsSingleton(false);
        item.setEstimatedValue(estimatedValue);
        return item;
    }
}
