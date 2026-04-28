package com.evemarket.backend.contracts;

import com.evemarket.backend.model.Contract;
import com.evemarket.backend.repository.ContractRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

@DataJpaTest
class ContractRepositoryTest {

    @Autowired
    ContractRepository contractRepository;

    // ── findActiveContracts ───────────────────────────────────────────────────

    @Test
    void findActiveContracts_excludesExpiredContracts() {
        contractRepository.save(contract(1L, 10000001, future(),  false));
        contractRepository.save(contract(2L, 10000001, expired(), false));

        Page<Contract> result = findActive(null, null, null, false);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().get(0).getContractId()).isEqualTo(1L);
    }

    @Test
    void findActiveContracts_filtersbyRegionId() {
        contractRepository.save(contract(10L, 10000001, future(), false));
        contractRepository.save(contract(11L, 10000043, future(), false));

        Page<Contract> derelik = findActive(10000001, null, null, false);
        Page<Contract> domain  = findActive(10000043, null, null, false);

        assertThat(derelik.getTotalElements()).isEqualTo(1);
        assertThat(derelik.getContent().get(0).getContractId()).isEqualTo(10L);
        assertThat(domain.getTotalElements()).isEqualTo(1);
        assertThat(domain.getContent().get(0).getContractId()).isEqualTo(11L);
    }

    @Test
    void findActiveContracts_filtersByMaxPrice() {
        contractRepository.save(contractWithPrice(20L, bd("3000000000"), future())); // 3B
        contractRepository.save(contractWithPrice(21L, bd("7000000000"), future())); // 7B

        Page<Contract> result = findActive(null, null, bd("5000000000"), false);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().get(0).getContractId()).isEqualTo(20L);
    }

    @Test
    void findActiveContracts_withPriceCompleteOnly_excludesIncompleteContracts() {
        contractRepository.save(contract(30L, 10000001, future(), false)); // complete
        contractRepository.save(contract(31L, 10000001, future(), true));  // incomplete

        Page<Contract> completeOnly = findActive(null, null, null, true);
        Page<Contract> all          = findActive(null, null, null, false);

        assertThat(completeOnly.getTotalElements()).isEqualTo(1);
        assertThat(completeOnly.getContent().get(0).getContractId()).isEqualTo(30L);
        assertThat(all.getTotalElements()).isEqualTo(2);
    }

    @Test
    void findActiveContracts_filtersbyCapitalTypeId() {
        Contract c1 = contract(40L, 10000001, future(), false);
        c1.setCapitalTypeId(23911); // Thanatos
        Contract c2 = contract(41L, 10000001, future(), false);
        c2.setCapitalTypeId(19724); // Phoenix
        contractRepository.save(c1);
        contractRepository.save(c2);

        Page<Contract> result = findActive(null, 23911, null, false);

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent().get(0).getContractId()).isEqualTo(40L);
    }

    // ── findContractIdsByRegionId ─────────────────────────────────────────────

    @Test
    void findContractIdsByRegionId_returnsIdsForRegionOnly() {
        contractRepository.save(contract(50L, 10000001, future(), false));
        contractRepository.save(contract(51L, 10000001, future(), false));
        contractRepository.save(contract(52L, 10000043, future(), false));

        Set<Long> ids = contractRepository.findContractIdsByRegionId(10000001);

        assertThat(ids).containsExactlyInAnyOrder(50L, 51L);
    }

    // ── deleteByDateExpiredBefore ─────────────────────────────────────────────

    @Test
    void deleteByDateExpiredBefore_removesOnlyExpiredContracts() {
        contractRepository.save(contract(60L, 10000001, future(),  false));
        contractRepository.save(contract(61L, 10000001, expired(), false));
        contractRepository.save(contract(62L, 10000001, expired(), false));

        contractRepository.deleteByDateExpiredBefore(Instant.now());

        assertThat(contractRepository.count()).isEqualTo(1);
        assertThat(contractRepository.findById(60L)).isPresent();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Page<Contract> findActive(Integer regionId, Integer capitalTypeId,
                                      BigDecimal maxPrice, boolean priceCompleteOnly) {
        return contractRepository.findActiveContracts(
                Instant.now(), regionId, capitalTypeId, maxPrice, priceCompleteOnly,
                PageRequest.of(0, 50, Sort.by("effectivePricePerUnit")));
    }

    private Contract contract(long id, int regionId, Instant expires, boolean priceIncomplete) {
        Contract c = new Contract();
        c.setContractId(id);
        c.setRegionId(regionId);
        c.setIssuerId(90000001L);
        c.setPrice(bd("5000000000"));
        c.setEffectiveCapitalPrice(bd("5000000000"));
        c.setEffectivePricePerUnit(bd("5000000000"));
        c.setNonCapItemValue(BigDecimal.ZERO);
        c.setPriceIncomplete(priceIncomplete);
        c.setUnknownPriceItemCount(0);
        c.setCapitalTypeId(23911);
        c.setCapitalTypeName("Thanatos");
        c.setCapitalGroupName("Carrier");
        c.setCapitalQuantity(1);
        c.setHasMixedCapitals(false);
        c.setDateIssued(Instant.now().minus(1, ChronoUnit.DAYS));
        c.setDateExpired(expires);
        c.setTitle("");
        c.setDiscoveredAt(Instant.now());
        return c;
    }

    private Contract contractWithPrice(long id, BigDecimal price, Instant expires) {
        Contract c = contract(id, 10000001, expires, false);
        c.setPrice(price);
        c.setEffectiveCapitalPrice(price);
        c.setEffectivePricePerUnit(price);
        return c;
    }

    private static Instant future()  { return Instant.now().plus(7, ChronoUnit.DAYS); }
    private static Instant expired() { return Instant.now().minus(1, ChronoUnit.HOURS); }
    private static BigDecimal bd(String v) { return new BigDecimal(v); }
}
